//! Lightweight WASAPI loopback spectrum for the equalizer editor.
use serde::Serialize;
use std::{
    collections::VecDeque,
    ffi::c_void,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use windows::{
    Win32::{
        Media::Audio::{
            eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
            AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        },
    },
};

const BANDS: [f64; 10] = [60.0, 170.0, 310.0, 600.0, 1000.0, 3000.0, 6000.0, 12000.0, 14000.0, 16000.0];
const WINDOW: usize = 2048;
const RING: usize = 4096;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Spectrum {
    levels: Vec<f32>,
}

#[derive(Default)]
pub struct State(Mutex<Option<Capture>>);
struct Capture {
    stop: Arc<AtomicBool>,
    worker: thread::JoinHandle<()>,
}

fn goertzel(samples: &[f32], rate: f64, frequency: f64) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let k = (0.5 + samples.len() as f64 * frequency / rate).floor() as usize;
    let omega = 2.0 * std::f64::consts::PI * k as f64 / samples.len() as f64;
    let coefficient = 2.0 * omega.cos();
    let mut q1 = 0.0;
    let mut q2 = 0.0;
    for sample in samples {
        let q0 = coefficient * q1 - q2 + *sample as f64;
        q2 = q1;
        q1 = q0;
    }
    let power = (q1 * q1 + q2 * q2 - coefficient * q1 * q2).max(0.0);
    (power.sqrt() / samples.len() as f64) as f32
}

fn levels(samples: &[f32], rate: f64) -> Vec<f32> {
    BANDS.iter().map(|frequency| {
        let amplitude = goertzel(samples, rate, *frequency);
        let db = 20.0 * (amplitude.max(1e-6) as f64).log10();
        (((db + 62.0) / 62.0).clamp(0.0, 1.0)) as f32
    }).collect()
}

fn decode(data: &[u8], frames: usize, channels: usize, bits: u16, tag: u16) -> Vec<f32> {
    let mut output = Vec::with_capacity(frames);
    let float = tag == 3 || (tag == 0xFFFE && bits == 32);
    match (bits, float) {
        (32, true) => {
            let values = unsafe { std::slice::from_raw_parts(data.as_ptr() as *const f32, frames * channels) };
            for frame in values.chunks_exact(channels) {
                output.push(frame.iter().sum::<f32>() / channels as f32);
            }
        }
        (16, false) => {
            let values = unsafe { std::slice::from_raw_parts(data.as_ptr() as *const i16, frames * channels) };
            for frame in values.chunks_exact(channels) {
                output.push(frame.iter().map(|value| *value as f32 / 32768.0).sum::<f32>() / channels as f32);
            }
        }
        (32, false) => {
            let values = unsafe { std::slice::from_raw_parts(data.as_ptr() as *const i32, frames * channels) };
            for frame in values.chunks_exact(channels) {
                output.push(frame.iter().map(|value| *value as f32 / 2147483648.0).sum::<f32>() / channels as f32);
            }
        }
        _ => {}
    }
    output
}

fn capture(app: tauri::AppHandle, stop: Arc<AtomicBool>) {
    let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let result = (|| -> windows::core::Result<()> {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole)? };
        let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None)? };
        let format = unsafe { client.GetMixFormat()? };
        if format.is_null() {
            return Ok(());
        }
        let info = unsafe { *format };
        let channels = info.nChannels.max(1) as usize;
        let rate = info.nSamplesPerSec.max(8000) as f64;
        let bits = info.wBitsPerSample;
        let tag = info.wFormatTag;
        unsafe {
            let init = client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                10_000_000,
                0,
                format,
                None,
            );
            CoTaskMemFree(Some(format as *const c_void));
            init?;
        }
        let capture: IAudioCaptureClient = unsafe { client.GetService()? };
        unsafe { client.Start()? };
        let mut ring = VecDeque::with_capacity(RING);
        let mut smoothed = vec![0.0f32; BANDS.len()];
        let mut last = Instant::now();
        while !stop.load(Ordering::Acquire) {
            let mut packet = unsafe { capture.GetNextPacketSize()? };
            while packet > 0 {
                let mut data = std::ptr::null_mut();
                let mut frames = 0;
                let mut flags = 0;
                unsafe {
                    capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                    if flags & 2 != 0 {
                        for _ in 0..frames { ring.push_back(0.0); }
                    } else if !data.is_null() {
                        let bytes = std::slice::from_raw_parts(data, frames as usize * info.nBlockAlign as usize);
                        for sample in decode(bytes, frames as usize, channels, bits, tag) {
                            ring.push_back(sample);
                        }
                    }
                    capture.ReleaseBuffer(frames)?;
                    packet = capture.GetNextPacketSize()?;
                }
                while ring.len() > RING { ring.pop_front(); }
            }
            if last.elapsed() >= Duration::from_millis(33) {
                last = Instant::now();
                let samples: Vec<f32> = ring.iter().rev().take(WINDOW).rev().copied().collect();
                let next = levels(&samples, rate);
                for (value, incoming) in smoothed.iter_mut().zip(next) {
                    *value = (*value * 0.68 + incoming * 0.32).clamp(0.0, 1.0);
                }
                let _ = app.emit_to("main", "equalizer-spectrum", Spectrum { levels: smoothed.clone() });
            }
            thread::sleep(Duration::from_millis(10));
        }
        unsafe { let _ = client.Stop(); }
        Ok(())
    })();
    if result.is_err() {
        let _ = app.emit_to("main", "equalizer-spectrum", Spectrum { levels: vec![0.0; BANDS.len()] });
    }
    unsafe { CoUninitialize(); }
}

#[tauri::command]
pub fn spectrum_start(app: tauri::AppHandle, state: tauri::State<'_, State>) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|_| "频谱状态不可用。".to_string())?;
    if current.is_some() {
        return Ok(());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let worker = thread::spawn(move || capture(app, flag));
    *current = Some(Capture { stop, worker });
    Ok(())
}

#[tauri::command]
pub fn spectrum_stop(state: tauri::State<'_, State>) -> Result<(), String> {
    if let Some(capture) = state.0.lock().map_err(|_| "频谱状态不可用。".to_string())?.take() {
        capture.stop.store(true, Ordering::Release);
        let _ = capture.worker.join();
    }
    Ok(())
}

pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<State>() {
        if let Ok(mut current) = state.0.lock() {
            if let Some(capture) = current.take() {
                capture.stop.store(true, Ordering::Release);
                let _ = capture.worker.join();
            }
        }
    }
}
