//! Bounded access to the filters attached to the active optical player.
use crate::ffi::error;
use discatelier_contracts::AppError;
use libloading::Library;
use std::{
    ffi::c_char,
    path::Path,
    sync::{
        atomic::{AtomicI32, Ordering},
        Arc, Mutex, Weak,
    },
};

type Configure = unsafe extern "C" fn(i32, i32);
type Read =
    unsafe extern "C" fn(i32, i32, i32, *mut i32, *mut i32, *mut u8, i32, *mut c_char, i32) -> i32;
type Pcm = unsafe extern "C" fn(i32, *mut i16, i32) -> i32;
static ACTIVE: Mutex<Option<Weak<Capture>>> = Mutex::new(None);
static COUNTER: AtomicI32 = AtomicI32::new(1);

pub struct Capture {
    pub(crate) number: i32,
    session: String,
    configure: Configure,
    read: Read,
    pcm: Pcm,
    mode: Mutex<i32>,
    _library: Library,
}
pub struct Frame {
    pub version: i32,
    pub text: String,
    pub bitmap: Option<(i32, i32, Vec<u8>)>,
}
impl Capture {
    pub(crate) fn open(vlc: &Path, session: &str) -> Option<Arc<Self>> {
        let path = vlc
            .parent()?
            .join("plugins/spu/libatelier_captions_plugin.dll");
        let result = unsafe {
            let library = Library::new(path).ok()?;
            Arc::new(Self {
                number: COUNTER.fetch_add(1, Ordering::Relaxed),
                session: session.into(),
                configure: *library.get(b"atelier_mode\0").ok()?,
                read: *library.get(b"atelier_read\0").ok()?,
                pcm: *library.get(b"atelier_pcm\0").ok()?,
                mode: Mutex::new(0),
                _library: library,
            })
        };
        *ACTIVE.lock().ok()? = Some(Arc::downgrade(&result));
        result.set_mode(0).ok()?;
        Some(result)
    }
    pub fn current(session: &str) -> Result<Arc<Self>, AppError> {
        ACTIVE
            .lock()
            .ok()
            .and_then(|w| w.as_ref()?.upgrade())
            .filter(|c| c.session == session)
            .ok_or_else(|| error("当前播放器没有光盘字幕组件。请使用随应用提供的 VLC 播放光盘。"))
    }
    pub fn set_mode(&self, mode: i32) -> Result<(), AppError> {
        let mut guard = self.mode.lock().map_err(|_| error("字幕服务不可用。"))?;
        unsafe { (self.configure)(self.number, mode) };
        *guard = mode;
        Ok(())
    }
    pub(crate) fn flush(&self) {
        if let Ok(mode) = self.mode.lock() {
            unsafe { (self.configure)(self.number, *mode) }
        }
    }
    pub fn frame(&self, previous: i32, paused: bool) -> Frame {
        let mut w = 0;
        let mut h = 0;
        let mut words = [0u8; 16384];
        let read = |w: &mut i32, h: &mut i32, dst: *mut u8, len: i32, text: &mut [u8]| unsafe {
            (self.read)(
                self.number,
                previous,
                paused.into(),
                w,
                h,
                dst,
                len,
                text.as_mut_ptr().cast(),
                text.len() as i32,
            )
        };
        let mut version = read(&mut w, &mut h, std::ptr::null_mut(), 0, &mut words);
        let mut bitmap = None;
        if version != 0
            && version != previous
            && w > 0
            && h > 0
            && (w as i64) * (h as i64) <= 4096 * 1080
        {
            let mut data = vec![0; (w * h) as usize];
            let confirm = read(
                &mut w,
                &mut h,
                data.as_mut_ptr(),
                data.len() as i32,
                &mut words,
            );
            if confirm == version {
                bitmap = Some((w, h, data));
            } else {
                version = 0;
                words.fill(0);
            }
        }
        let end = words.iter().position(|v| *v == 0).unwrap_or(words.len());
        Frame {
            version,
            text: String::from_utf8_lossy(&words[..end]).into_owned(),
            bitmap,
        }
    }
    pub fn audio(&self) -> Option<Vec<i16>> {
        let mut wave = vec![0; 16000 * 4];
        let n = unsafe { (self.pcm)(self.number, wave.as_mut_ptr(), wave.len() as i32) };
        (n == wave.len() as i32).then_some(wave)
    }
}
