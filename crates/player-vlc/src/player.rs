use crate::ffi::{self, Api, Handle};
use discatelier_contracts::{
    AppError, AudioTrack, MenuDirection, PlaybackControl, PlaybackSnapshot,
};
use std::{ffi::CString, path::Path, ptr};

pub struct Player {
    pub api: Api,
    pub handle: Handle,
    instance: Handle,
}
impl Player {
    pub fn open(
        path: &Path,
        location: &str,
        window: usize,
        track: Option<u8>,
    ) -> Result<Self, AppError> {
        let api = Api::load(path)?;
        let location = CString::new(location).map_err(|_| ffi::error("光盘路径无效。"))?;
        // These flags are defined by VLC 3's src/libvlc-module.c.
        let options = [
            CString::new("--ignore-config").unwrap(),
            CString::new("--no-media-library").unwrap(),
        ];
        let args: Vec<_> = options.iter().map(|s| s.as_ptr()).collect();
        unsafe {
            let instance = (api.libvlc_new)(args.len() as i32, args.as_ptr());
            if instance.is_null() {
                return Err(ffi::error(
                    "libVLC 初始化失败，请检查安装目录中的 plugins。",
                ));
            }
            let media = (api.libvlc_media_new_location)(instance, location.as_ptr());
            if media.is_null() {
                (api.libvlc_release)(instance);
                return Err(ffi::error("无法打开光盘。"));
            }
            if let Some(number) = track {
                let option = CString::new(format!("cdda-track={number}")).unwrap();
                (api.libvlc_media_add_option)(media, option.as_ptr());
            }
            let handle = (api.libvlc_media_player_new_from_media)(media);
            (api.libvlc_media_release)(media);
            if handle.is_null() {
                (api.libvlc_release)(instance);
                return Err(ffi::error("无法创建光盘播放器。"));
            }
            let player = Self {
                api,
                instance,
                handle,
            };
            (player.api.libvlc_media_player_set_hwnd)(handle, window as Handle);
            (player.api.libvlc_video_set_mouse_input)(handle, 1);
            (player.api.libvlc_video_set_key_input)(handle, 0);
            (player.api.libvlc_media_player_set_video_title_display)(handle, -1, 0);
            if (player.api.libvlc_media_player_play)(handle) != 0 {
                return Err(ffi::error("无法开始光盘播放。"));
            }
            Ok(player)
        }
    }
    pub fn titles(&self) -> Vec<(i32, bool)> {
        unsafe {
            let mut titles = ptr::null_mut();
            let count = (self.api.libvlc_media_player_get_full_title_descriptions)(
                self.handle,
                &mut titles,
            );
            let mut result = Vec::new();
            if count > 0 && !titles.is_null() {
                for i in 0..count.min(10000) {
                    let title = *titles.add(i as usize);
                    if !title.is_null() {
                        result.push((i, (*title).flags & 1 != 0));
                    }
                }
                (self.api.libvlc_title_descriptions_release)(titles, count as u32);
            }
            result
        }
    }
    pub fn tracks(&self) -> (Vec<AudioTrack>, Option<i64>) {
        unsafe {
            let selected = (self.api.libvlc_audio_get_track)(self.handle);
            let first = (self.api.libvlc_audio_get_track_description)(self.handle);
            let mut entry = first;
            let mut tracks = Vec::new();
            for _ in 0..1024 {
                if entry.is_null() {
                    break;
                }
                let track = &*entry;
                if track.id >= 0 {
                    tracks.push(AudioTrack {
                        id: track.id as i64,
                        title: ffi::text(track.name),
                        language: String::new(),
                        codec: String::new(),
                        channels: None,
                        selected: selected == track.id,
                    });
                }
                entry = track.next;
            }
            if !first.is_null() {
                (self.api.libvlc_track_description_list_release)(first);
            }
            (tracks, (selected >= 0).then_some(selected as i64))
        }
    }
    pub fn control(
        &self,
        command: PlaybackControl,
        snapshot: &PlaybackSnapshot,
    ) -> Result<(), AppError> {
        unsafe {
            match command {
                PlaybackControl::Pause { paused } => {
                    (self.api.libvlc_media_player_set_pause)(self.handle, paused.into())
                }
                PlaybackControl::Seek { seconds } => {
                    validate_seek(snapshot, seconds)?;
                    (self.api.libvlc_media_player_set_time)(self.handle, (seconds * 1000.0) as i64);
                }
                PlaybackControl::Volume { volume } => {
                    if volume > 100 {
                        return Err(ffi::error("音量必须在 0–100 之间。"));
                    }
                    if (self.api.libvlc_audio_set_volume)(self.handle, volume as i32) != 0 {
                        return Err(ffi::error("音量调整失败。"));
                    }
                }
                PlaybackControl::Rate { rate } => {
                    if !rate.is_finite() || !(0.25..=4.0).contains(&rate) {
                        return Err(ffi::error("播放速度必须在 0.25–4 倍之间。"));
                    }
                    if (self.api.libvlc_media_player_set_rate)(self.handle, rate as f32) != 0 {
                        return Err(ffi::error("播放速度调整失败。"));
                    }
                }
                PlaybackControl::Audio { id } => {
                    if !snapshot.audio_tracks.iter().any(|track| track.id == id)
                        || (self.api.libvlc_audio_set_track)(self.handle, id as i32) != 0
                    {
                        return Err(ffi::error("此音轨当前不可切换。"));
                    }
                }
                PlaybackControl::Menu { direction } => {
                    if snapshot.source.playlist != crate::DVD_MENU {
                        return Err(ffi::error("音频 CD 没有 DVD 菜单。"));
                    }
                    if matches!(direction, MenuDirection::Root) {
                        // DVDnav marks its root-menu title with libvlc_title_menu.
                        let title = self
                            .titles()
                            .into_iter()
                            .find(|(_, menu)| *menu)
                            .ok_or_else(|| ffi::error("此时没有可用的原盘菜单。"))?;
                        (self.api.libvlc_media_player_set_pause)(self.handle, 0);
                        (self.api.libvlc_media_player_set_title)(self.handle, title.0);
                    } else {
                        let value = match direction {
                            MenuDirection::Activate => 0,
                            MenuDirection::Up => 1,
                            MenuDirection::Down => 2,
                            MenuDirection::Left => 3,
                            MenuDirection::Right => 4,
                            MenuDirection::Root => unreachable!(),
                        };
                        (self.api.libvlc_media_player_navigate)(self.handle, value);
                    }
                }
                PlaybackControl::Stop => {}
            }
        }
        Ok(())
    }
}
pub fn validate_seek(snapshot: &PlaybackSnapshot, seconds: f64) -> Result<(), AppError> {
    if !snapshot.seekable
        || snapshot.dvd_menu
        || !seconds.is_finite()
        || seconds < 0.0
        || !snapshot
            .duration_seconds
            .is_some_and(|duration| seconds <= duration)
    {
        return Err(ffi::error("当前画面不支持跳转到这个位置。"));
    }
    Ok(())
}
impl Drop for Player {
    fn drop(&mut self) {
        unsafe {
            (self.api.libvlc_media_player_stop)(self.handle);
            (self.api.libvlc_media_player_release)(self.handle);
            (self.api.libvlc_release)(self.instance);
        }
    }
}
