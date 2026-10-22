//! Read the whole CD directory with both audio and video disabled.
//! VLC 3 skips discs in its preparser; its CD access module enumerates child
//! items when opened without cdda-track. Children are never played here.
use crate::{
    audio_cd,
    ffi::{self, Api, Handle},
};
use discatelier_contracts::{AppError, CdTrackMetadata, PlaybackSource};
use std::{
    ffi::CString,
    path::Path,
    thread,
    time::{Duration, Instant},
};

struct Reader {
    api: Api,
    instance: Handle,
    media: Handle,
    input: Handle,
}
impl Drop for Reader {
    fn drop(&mut self) {
        unsafe {
            if !self.input.is_null() {
                (self.api.libvlc_media_player_stop)(self.input);
                (self.api.libvlc_media_player_release)(self.input);
            }
            if !self.media.is_null() {
                (self.api.libvlc_media_release)(self.media);
            }
            (self.api.libvlc_release)(self.instance);
        }
    }
}
impl Reader {
    fn meta(&self, media: Handle, field: i32) -> Option<String> {
        unsafe {
            let pointer = (self.api.libvlc_media_get_meta)(media, field);
            let value = ffi::text(pointer);
            (self.api.libvlc_free)(pointer.cast());
            (!value.trim().is_empty()).then_some(value)
        }
    }
    fn tracks(&self) -> Vec<CdTrackMetadata> {
        let api = &self.api;
        unsafe {
            let list = (api.libvlc_media_subitems)(self.media);
            if list.is_null() {
                return Vec::new();
            }
            (api.libvlc_media_list_lock)(list);
            let count = (api.libvlc_media_list_count)(list);
            let mut result = Vec::new();
            if (1..=99).contains(&count) {
                for index in 0..count {
                    let item = (api.libvlc_media_list_item_at_index)(list, index);
                    if item.is_null() {
                        continue;
                    }
                    // libvlc_meta_t values from the VLC 3 public header. Never infer
                    // track identity from a title or the order of a search result.
                    if let Some(number) = self
                        .meta(item, 5)
                        .and_then(|s| s.parse::<u8>().ok())
                        .filter(|n| (1..=99).contains(n))
                    {
                        result.push(CdTrackMetadata {
                            number,
                            title: self.meta(item, 0),
                            artist: self.meta(item, 1),
                            album: self.meta(item, 4),
                            date: self.meta(item, 8),
                            genre: self.meta(item, 2),
                            track_total: self.meta(item, 17).and_then(|s| s.parse().ok()),
                        });
                    }
                    (api.libvlc_media_release)(item);
                }
            }
            (api.libvlc_media_list_unlock)(list);
            (api.libvlc_media_list_release)(list);
            result
        }
    }
}
pub fn read_cd_metadata(
    path: &Path,
    source: &PlaybackSource,
) -> Result<Vec<CdTrackMetadata>, AppError> {
    let location =
        CString::new(audio_cd::location(source)?.0).map_err(|_| ffi::error("CD 路径无效。"))?;
    let api = Api::load(path)?;
    let options = [
        "--ignore-config",
        "--no-media-library",
        "--metadata-network-access",
        "--no-audio",
        "--no-video",
    ]
    .map(|s| CString::new(s).unwrap());
    let args: Vec<_> = options.iter().map(|s| s.as_ptr()).collect();
    let instance = unsafe { (api.libvlc_new)(args.len() as i32, args.as_ptr()) };
    if instance.is_null() {
        return Err(ffi::error("无法初始化 CD 资料读取。"));
    }
    let media = unsafe { (api.libvlc_media_new_location)(instance, location.as_ptr()) };
    let mut reader = Reader {
        api,
        instance,
        media,
        input: std::ptr::null_mut(),
    };
    if media.is_null() {
        return Err(ffi::error("无法读取 CD 资料。"));
    }
    reader.input = unsafe { (reader.api.libvlc_media_player_new_from_media)(media) };
    if reader.input.is_null() || unsafe { (reader.api.libvlc_media_player_play)(reader.input) } != 0
    {
        return Err(ffi::error("CD 资料读取未启动。"));
    }
    let started = Instant::now();
    loop {
        let status = unsafe { (reader.api.libvlc_media_player_get_state)(reader.input) };
        if (5..=7).contains(&status) {
            let tracks = reader.tracks();
            if !tracks.is_empty() {
                return Ok(tracks);
            }
            return Err(ffi::error("CD 没有返回曲目资料。"));
        }
        if started.elapsed() >= Duration::from_secs(20) {
            return Err(ffi::error(format!("CD 资料读取未完成（{status}）。")));
        }
        thread::sleep(Duration::from_millis(50));
    }
}
