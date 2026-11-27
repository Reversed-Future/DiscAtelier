use super::error;
use super::timing::{parse, Cue};
use discatelier_contracts::AppError;
use std::os::windows::process::CommandExt;
use std::{
    fs,
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

pub const WINDOW: u64 = 12;
fn run(cmd: &mut Command, stop: &AtomicBool, timeout: u64, message: &str) -> Result<(), AppError> {
    if stop.load(Ordering::Acquire) {
        return Err(error("字幕任务已切换。"));
    }
    let mut child = cmd
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| error(message))?;
    let begin = Instant::now();
    loop {
        if stop.load(Ordering::Acquire) || begin.elapsed() > Duration::from_secs(timeout) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error(if stop.load(Ordering::Acquire) {
                "字幕任务已切换。"
            } else {
                "字幕处理超时，可在设置中选择较小的模型。"
            }));
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(error(message))
                }
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error(message));
            }
        }
    }
}
pub struct Engine {
    pub scratch: std::path::PathBuf,
    pub mpv: std::path::PathBuf,
    pub whisper: std::path::PathBuf,
    pub model: std::path::PathBuf,
    pub language: String,
}
// mpv writes RIFF/WAVE with PCM or WAVE_FORMAT_EXTENSIBLE. Inspect only the
// sample payload, so header bytes cannot turn digital silence into dialogue.
fn audio_offset(wave: &[u8]) -> Option<usize> {
    // The decoder is configured to emit 16 kHz mono signed 16-bit PCM.
    // Skip digital silence only. Unknown headers keep their original timeline.
    if !wave.starts_with(b"RIFF") || wave.get(8..12) != Some(b"WAVE") {
        return Some(0);
    }
    let mut offset = 12;
    while let Some(header) = wave.get(offset..offset + 8) {
        let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let start = offset + 8;
        let Some(data) = wave.get(start..start + length) else {
            return Some(0);
        };
        if &header[..4] == b"data" {
            return data
                .chunks_exact(2)
                .position(|p| i16::from_le_bytes([p[0], p[1]]).unsigned_abs() >= 8)
                .map(|sample| (sample / 16).saturating_sub(20));
        }
        offset = start + length + length % 2;
    }
    Some(0)
}
impl Engine {
    pub fn recognize(
        &self,
        video: &Path,
        track: usize,
        start: u64,
        stop: &AtomicBool,
    ) -> Result<Vec<Cue>, AppError> {
        // Each job owns exactly two temporary files. Native tools use ASCII relative
        // output names, including when the Windows profile path contains Unicode.
        fs::create_dir_all(&self.scratch)
            .map_err(|e| error(format!("无法创建字幕缓存目录：{e}")))?;
        let pcm = tempfile::Builder::new()
            .prefix("captions-")
            .suffix(".wav")
            .tempfile_in(&self.scratch)
            .map_err(|e| error(format!("无法创建字幕临时文件：{e}")))?
            .into_temp_path();
        let folder = pcm.parent().unwrap();
        let mut decode = Command::new(&self.mpv);
        decode
            .current_dir(folder)
            .args([
                "--no-config",
                "--load-scripts=no",
                "--no-video",
                "--no-sub",
                "--audio-file-auto=no",
                "--no-terminal",
                "--audio-channels=mono",
                "--audio-samplerate=16000",
                "--audio-format=s16",
                "--ao=pcm",
            ])
            .arg(format!(
                "--ao-pcm-file={}",
                pcm.file_name().unwrap().to_string_lossy()
            ))
            .arg(format!("--aid={track}"))
            .arg(format!("--start={start}"))
            .arg(format!("--length={WINDOW}"))
            .arg("--")
            .arg(video);
        run(&mut decode, stop, 30, "无法读取当前视频音轨。")?;
        self.transcribe(&pcm, start, stop)
    }
    pub fn recognize_live(&self, samples: &[i16], stop: &AtomicBool) -> Result<Vec<Cue>, AppError> {
        use std::io::Write;
        fs::create_dir_all(&self.scratch).map_err(|e| error(e.to_string()))?;
        let mut file = tempfile::Builder::new()
            .suffix(".wav")
            .tempfile_in(&self.scratch)
            .map_err(|e| error(e.to_string()))?;
        let bytes = (samples.len() * 2) as u32;
        let mut wav = Vec::with_capacity(44 + bytes as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + bytes).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&16000u32.to_le_bytes());
        wav.extend_from_slice(&32000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&bytes.to_le_bytes());
        for v in samples {
            wav.extend_from_slice(&v.to_le_bytes());
        }
        file.write_all(&wav).map_err(|e| error(e.to_string()))?;
        self.transcribe(&file.into_temp_path(), 0, stop)
    }
    fn transcribe(&self, pcm: &Path, start: u64, stop: &AtomicBool) -> Result<Vec<Cue>, AppError> {
        let folder = pcm.parent().unwrap();
        let base = format!("discatelier-caption-{}", uuid::Uuid::new_v4());
        let json = tempfile::Builder::new()
            .prefix(&base)
            .suffix(".json")
            .tempfile_in(folder)
            .map_err(|_| error("无法创建字幕结果文件。"))?
            .into_temp_path();
        let out = json.file_stem().unwrap();
        let size = fs::metadata(&pcm)
            .map_err(|_| error("无法读取音轨片段。"))?
            .len();
        if size < 128 {
            return Ok(vec![]);
        }
        if size > (WINDOW + 2) * 32000 {
            return Err(error("音频片段长度异常。"));
        }
        let wave = fs::read(&pcm).map_err(|_| error("无法读取音轨片段。"))?;
        let Some(offset_ms) = audio_offset(&wave) else {
            return Ok(vec![]);
        };
        let mut cmd = Command::new(&self.whisper);
        cmd.current_dir(folder)
            .arg("-m")
            .arg(&self.model)
            .arg("-l")
            .arg(&self.language)
            .arg("-ot")
            .arg(offset_ms.to_string())
            .args(["-t", "4", "-bs", "1", "-bo", "1", "-sns", "-ojf", "-of"])
            .arg(out)
            .arg("-f")
            .arg(pcm.file_name().unwrap());
        run(
            &mut cmd,
            stop,
            120,
            "Whisper 无法识别这个片段，请检查模型文件和可用内存。",
        )?;
        let bytes = fs::read(&json).map_err(|_| error("无法读取识别结果。"))?;
        parse(&bytes, start, WINDOW as f64)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires the bundled runtime, a real Whisper model and a two-track speech/silence fixture"]
    fn real_speech_seek_and_silent_track() {
        let file = |name| std::path::PathBuf::from(std::env::var_os(name).expect(name));
        let engine = Engine {
            scratch: file("SUBTITLE_TEST_VIDEO")
                .parent()
                .unwrap()
                .join("caption-cache"),
            mpv: file("SUBTITLE_TEST_MPV"),
            whisper: file("SUBTITLE_TEST_CLI"),
            model: file("SUBTITLE_TEST_MODEL"),
            language: "en".into(),
        };
        let movie = file("SUBTITLE_TEST_VIDEO");
        let stop = AtomicBool::new(false);
        let first = engine.recognize(&movie, 1, 0, &stop).unwrap();
        assert!(first
            .iter()
            .any(|cue| cue.text.to_lowercase().contains("country")));
        let seek = engine.recognize(&movie, 1, 24, &stop).unwrap();
        assert!(!seek.is_empty() && seek.iter().all(|cue| cue.start >= 24. && cue.end <= 36.));
        assert!(engine.recognize(&movie, 2, 24, &stop).unwrap().is_empty());
        stop.store(true, Ordering::Release);
        assert!(engine.recognize(&movie, 1, 0, &stop).is_err());
    }
    #[test]
    fn segment_times_are_absolute_and_empty_audio_is_not_a_caption() {
        let cues=parse(br#"{"transcription":[{"offsets":{"from":500,"to":1500},"text":" Hello "},{"offsets":{"from":1600,"to":1800},"text":"[BLANK_AUDIO]"},{"offsets":{"from":2000,"to":2000},"text":"empty"}]}"#,24,12.).unwrap();
        assert_eq!(cues.len(), 1);
        assert_eq!(
            (cues[0].start, cues[0].end, cues[0].text.as_str()),
            (24.5, 25.5, "Hello")
        );
    }
}
