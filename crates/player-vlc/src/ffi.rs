//! libVLC 3 ABI, checked against VideoLAN's vlc-3.0 public headers.
//! Pointers stay on one worker thread. The library outlives every VLC object.
use discatelier_contracts::AppError;
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_uint, c_void, CStr},
    path::Path,
};

pub type Handle = *mut c_void;
#[repr(C)]
pub struct Track {
    pub id: c_int,
    pub name: *mut c_char,
    pub next: *mut Track,
}
#[repr(C)]
pub struct Title {
    pub duration: i64,
    pub name: *mut c_char,
    pub flags: c_uint,
}
macro_rules! api {
    ($($name:ident: $signature:ty),+ $(,)?) => {
        pub struct Api {
            $(pub $name: $signature,)+
            _library: Library,
        }
        impl Api {
            pub fn load(path: &Path) -> Result<Self, AppError> {
                // Absolute path and restricted dependency search; no global DLL/PATH changes.
                #[cfg(windows)]
                let library: Library = unsafe {
                    use windows_sys::Win32::System::LibraryLoader::{
                        LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32,
                    };
                    libloading::os::windows::Library::load_with_flags(
                        path, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32
                    ).map_err(|e| error(format!("无法加载 libVLC：{e}")))?.into()
                };
                #[cfg(not(windows))]
                let library = unsafe { Library::new(path) }
                    .map_err(|e| error(format!("无法加载 libVLC：{e}")))?;
                let api = unsafe {
                    Self {
                        $($name: *library.get::<$signature>(concat!(stringify!($name), "\0").as_bytes())
                            .map_err(|_| error(concat!("libVLC 缺少接口：", stringify!($name))))?,)+
                        _library: library,
                    }
                };
                let version = unsafe { text((api.libvlc_get_version)()) };
                if !version.starts_with("3.") {
                    return Err(error("此后端需要 libVLC 3.x。"));
                }
                Ok(api)
            }
        }
    };
}
api! {
    libvlc_get_version: unsafe extern "C" fn() -> *const c_char,
    libvlc_new: unsafe extern "C" fn(c_int, *const *const c_char) -> Handle,
    libvlc_release: unsafe extern "C" fn(Handle),
    libvlc_media_new_location: unsafe extern "C" fn(Handle, *const c_char) -> Handle,
    libvlc_media_release: unsafe extern "C" fn(Handle),
    libvlc_media_player_new_from_media: unsafe extern "C" fn(Handle) -> Handle,
    libvlc_media_player_release: unsafe extern "C" fn(Handle),
    libvlc_media_player_set_hwnd: unsafe extern "C" fn(Handle, Handle),
    libvlc_media_player_play: unsafe extern "C" fn(Handle) -> c_int,
    libvlc_media_player_stop: unsafe extern "C" fn(Handle),
    libvlc_media_player_set_pause: unsafe extern "C" fn(Handle, c_int),
    libvlc_media_player_get_state: unsafe extern "C" fn(Handle) -> c_int,
    libvlc_media_player_get_time: unsafe extern "C" fn(Handle) -> i64,
    libvlc_media_player_set_time: unsafe extern "C" fn(Handle, i64),
    libvlc_media_player_get_length: unsafe extern "C" fn(Handle) -> i64,
    libvlc_media_player_is_seekable: unsafe extern "C" fn(Handle) -> c_int,
    libvlc_media_player_get_title: unsafe extern "C" fn(Handle) -> c_int,
    libvlc_media_player_set_title: unsafe extern "C" fn(Handle, c_int),
    libvlc_media_player_get_full_title_descriptions: unsafe extern "C" fn(Handle, *mut *mut *mut Title) -> c_int,
    libvlc_title_descriptions_release: unsafe extern "C" fn(*mut *mut Title, c_uint),
    libvlc_media_player_navigate: unsafe extern "C" fn(Handle, c_uint),
    libvlc_video_set_mouse_input: unsafe extern "C" fn(Handle, c_uint),
    libvlc_video_set_key_input: unsafe extern "C" fn(Handle, c_uint),
    libvlc_media_player_set_video_title_display: unsafe extern "C" fn(Handle, c_int, c_uint),
    libvlc_audio_get_track: unsafe extern "C" fn(Handle) -> c_int,
    libvlc_audio_set_track: unsafe extern "C" fn(Handle, c_int) -> c_int,
    libvlc_audio_get_track_description: unsafe extern "C" fn(Handle) -> *mut Track,
    libvlc_track_description_list_release: unsafe extern "C" fn(*mut Track),
}
pub fn error(message: impl Into<String>) -> AppError {
    AppError::new("dvd", message)
}
pub unsafe fn text(pointer: *const c_char) -> String {
    if pointer.is_null() {
        String::new()
    } else {
        CStr::from_ptr(pointer).to_string_lossy().into_owned()
    }
}
