//! A seekable libVLC input for one physical Blu-ray playlist.
use crate::ffi::{self, Api, Handle};
use discatelier_contracts::{AppError, PlaybackSource};
use libloading::Library;
use std::{
    ffi::{c_char, c_int, CString},
    ptr,
};

type Open = unsafe extern "C" fn(*const c_char, *const c_char) -> Handle;
type Select = unsafe extern "C" fn(Handle, u32) -> c_int;
type Read = unsafe extern "C" fn(Handle, *mut u8, c_int) -> c_int;
type Seek = unsafe extern "C" fn(Handle, u64) -> i64;
type Size = unsafe extern "C" fn(Handle) -> u64;
type Close = unsafe extern "C" fn(Handle);

pub struct DiscInput {
    mount: CString,
    playlist: u32,
    open: Open,
    select: Select,
    read: Read,
    seek: Seek,
    size: Size,
    close: Close,
    _dll: Library,
}

impl DiscInput {
    pub fn new(source: &PlaybackSource) -> Result<Box<Self>, AppError> {
        crate::bluray_location(source)?;
        let id = source
            .playlist
            .strip_suffix(".mpls")
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| ffi::error("蓝光播放列表编号无效。"))?;
        let exe = std::env::current_exe().map_err(|_| ffi::error("无法定位蓝光播放组件。"))?;
        let path = exe.with_file_name("aacs").join("libbluray.dll");
        let dll = ffi::load_library(&path)
            .map_err(|e| ffi::error(format!("无法加载蓝光播放组件：{e}")))?;
        unsafe {
            macro_rules! symbol {
                ($n:literal) => {
                    *dll.get(concat!($n, "\0").as_bytes())
                        .map_err(|_| ffi::error(concat!("蓝光组件缺少接口 ", $n)))?
                };
            }
            Ok(Box::new(Self {
                mount: CString::new(format!("{}/", source.mount_point))
                    .map_err(|_| ffi::error("光驱无效。"))?,
                playlist: id,
                open: symbol!("bd_open"),
                select: symbol!("bd_select_playlist"),
                read: symbol!("bd_read"),
                seek: symbol!("bd_seek"),
                size: symbol!("bd_get_title_size"),
                close: symbol!("bd_close"),
                _dll: dll,
            }))
        }
    }

    // The Player owns this boxed context until libVLC has stopped and released the media.
    pub unsafe fn media(&self, api: &Api, instance: Handle) -> Handle {
        (api.libvlc_media_new_callbacks)(
            instance,
            open,
            read,
            seek,
            close,
            self as *const Self as Handle,
        )
    }
}

struct Stream {
    handle: Handle,
    read: Read,
    seek: Seek,
    close: Close,
    size: u64,
    eof: bool,
}

unsafe extern "C" fn open(opaque: Handle, data: *mut Handle, size: *mut u64) -> c_int {
    let input = &*(opaque as *const DiscInput);
    let handle = (input.open)(input.mount.as_ptr(), ptr::null());
    if handle.is_null() {
        return -1;
    }
    if (input.select)(handle, input.playlist) == 0 {
        (input.close)(handle);
        return -1;
    }
    *size = (input.size)(handle);
    *data = Box::into_raw(Box::new(Stream {
        handle,
        read: input.read,
        seek: input.seek,
        close: input.close,
        size: *size,
        eof: false,
    })) as Handle;
    0
}

unsafe extern "C" fn read(data: Handle, buffer: *mut u8, len: usize) -> isize {
    let stream = &mut *(data as *mut Stream);
    if stream.eof {
        return 0;
    }
    (stream.read)(stream.handle, buffer, len.min(c_int::MAX as usize) as c_int) as isize
}

unsafe extern "C" fn seek(data: Handle, offset: u64) -> c_int {
    let stream = &mut *(data as *mut Stream);
    if offset > stream.size {
        return -1;
    }
    stream.eof = offset == stream.size;
    if stream.eof {
        return 0;
    }
    // libbluray seeks to an access unit. VLC's byte-stream contract requires the exact offset.
    let landed = (stream.seek)(stream.handle, offset);
    if landed < 0 || landed as u64 > offset {
        return -1;
    }
    let mut remaining = offset - landed as u64;
    let mut scratch = [0u8; 32768];
    while remaining > 0 {
        let len = remaining.min(scratch.len() as u64) as c_int;
        let n = (stream.read)(stream.handle, scratch.as_mut_ptr(), len);
        if n <= 0 || n > len {
            return -1;
        }
        remaining -= n as u64;
    }
    0
}

unsafe extern "C" fn close(data: Handle) {
    let stream = Box::from_raw(data as *mut Stream);
    (stream.close)(stream.handle);
}
