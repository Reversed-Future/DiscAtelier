use crate::ffi::{self, Api, Handle};
use discatelier_contracts::{
    AppError, AudioTrack, MenuDirection, PlaybackControl, PlaybackSnapshot,
};
use std::{
    ffi::CString,
    path::{Path, PathBuf},
    ptr,
    sync::Mutex,
};

pub struct Player {
    pub api: Api,
    pub handle: Handle,
    instance: Handle,
    equalizer: Mutex<Option<StoredEqualizer>>,
}

#[derive(Clone)]
struct StoredEqualizer {
    enabled: bool,
    preamp: f64,
    bands: Vec<f64>,
}

/// VLC's equalizer applies EQZ_IN_FACTOR (0.25) before the band sum, so a
/// flat curve needs about +12.04 dB just to reach unity gain.
const VLC_EQUALIZER_HEADROOM_DB: f64 = 12.0412;
pub(crate) fn compensated_preamp(preamp: f64) -> f32 {
    (preamp + VLC_EQUALIZER_HEADROOM_DB).clamp(-20.0, 20.0) as f32
}

/// VLC statically links libbluray into `plugins/access`, which can make the
/// jar lookup resolve to the application directory. Point libbluray at the
/// VLC runtime's own JAR directory before libVLC is initialized.
fn plain_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

fn configure_bluray_classpath(libvlc: &Path) {
    let Some(root) = libvlc.parent() else {
        return;
    };
    let root = plain_path(root.to_path_buf());
    let access = root.join("plugins").join("access");
    let mut found = false;
    if let Ok(entries) = std::fs::read_dir(&access) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("libbluray-j2se-") && name.ends_with(".jar") && entry.path().is_file()
            {
                found = true;
                break;
            }
        }
    }
    if found {
        let mut classpath = access.to_string_lossy().into_owned();
        if !classpath.ends_with('\\') && !classpath.ends_with('/') {
            classpath.push('\\');
        }
        std::env::set_var("LIBBLURAY_CP", classpath);
    } else {
        // Let libbluray use its normal adjacent/search paths.
        std::env::remove_var("LIBBLURAY_CP");
    }
    for (file, variable) in [
        ("libaacs.dll", "LIBAACS_PATH"),
        ("libbdplus.dll", "LIBBDPLUS_PATH"),
    ] {
        let candidate = root.join(file);
        if candidate.is_file() {
            std::env::set_var(variable, candidate.with_extension(""));
        }
    }
}

impl Player {
    pub fn open(
        path: &Path,
        location: &str,
        window: usize,
        track: Option<u8>,
        bluray_menu: bool,
        bluray_direct: bool,
        silent: bool,
        fade_in: bool,
    ) -> Result<Self, AppError> {
        if bluray_menu {
            configure_bluray_classpath(path);
        }
        let api = Api::load(path)?;
        let location = CString::new(location).map_err(|_| ffi::error("光盘路径无效。"))?;
        // These flags are defined by VLC 3's src/libvlc-module.c.
        let mut options = vec![
            CString::new("--ignore-config").unwrap(),
            CString::new("--no-media-library").unwrap(),
            // Keep playback volume inside VLC's software mixer instead of
            // sharing the Windows WASAPI application session.
            CString::new("--aout=directsound").unwrap(),
        ];
        if silent {
            options.push(CString::new("--no-audio").unwrap());
        }
        if bluray_menu {
            let log = crate::menu_log_path();
            let _ = std::fs::remove_file(&log);
            options.push(CString::new("--file-logging").unwrap());
            options.push(CString::new(format!("--logfile={}", log.display())).unwrap());
            options.push(CString::new("--verbose=2").unwrap());
        }
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
            if bluray_menu {
                let option = CString::new(":bluray-menu=1").unwrap();
                (api.libvlc_media_add_option)(media, option.as_ptr());
            } else if bluray_direct {
                // Explicitly disable the top-menu path; otherwise VLC can
                // start at First Play (a short logo) for a concrete playlist.
                let option = CString::new(":bluray-menu=0").unwrap();
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
                equalizer: Mutex::new(None),
            };
            (player.api.libvlc_media_player_set_hwnd)(handle, window as Handle);
            (player.api.libvlc_video_set_mouse_input)(handle, 1);
            (player.api.libvlc_video_set_key_input)(handle, 0);
            (player.api.libvlc_media_player_set_video_title_display)(handle, -1, 0);
            if fade_in && (player.api.libvlc_audio_set_volume)(handle, 0) != 0 {
                return Err(ffi::error("无法初始化音乐音量。"));
            }
            if (player.api.libvlc_media_player_play)(handle) != 0 {
                return Err(ffi::error("无法开始光盘播放。"));
            }
            Ok(player)
        }
    }
    pub fn snapshot(&self, path: &Path) -> Result<(), AppError> {
        let path = CString::new(path.to_string_lossy().as_bytes())
            .map_err(|_| ffi::error("截图路径无效。"))?;
        if unsafe {
            (self.api.libvlc_video_take_snapshot)(self.handle, 0, path.as_ptr(), 1280, 720)
        } != 0
        {
            return Err(ffi::error("无法截取光盘菜单画面。"));
        }
        Ok(())
    }

    pub fn titles_with_names(&self) -> Vec<(i32, bool, String)> {
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
                        result.push((i, (*title).flags & 1 != 0, ffi::text((*title).name)));
                    }
                }
                (self.api.libvlc_title_descriptions_release)(titles, count as u32);
            }
            result
        }
    }
    pub fn titles(&self) -> Vec<(i32, bool)> {
        self.titles_with_names()
            .into_iter()
            .map(|(index, menu, _)| (index, menu))
            .collect()
    }
    fn media_audio_metadata(&self) -> Vec<(i32, String, String, String, Option<u64>)> {
        unsafe {
            let media = (self.api.libvlc_media_player_get_media)(self.handle);
            if media.is_null() {
                return Vec::new();
            }
            let mut list: *mut *mut ffi::MediaTrack = ptr::null_mut();
            let count = (self.api.libvlc_media_tracks_get)(media, &mut list);
            let mut result = Vec::new();
            if count > 0 && !list.is_null() {
                for index in 0..count {
                    let track = *list.add(index as usize);
                    if track.is_null() || (*track).track_type != 0 {
                        continue;
                    }
                    let audio = (*track).audio;
                    let channels = if audio.is_null() {
                        None
                    } else {
                        Some((*audio).channels as u64)
                    };
                    let codec = ffi::text((self.api.libvlc_media_get_codec_description)(
                        0,
                        (*track).codec,
                    ));
                    result.push((
                        (*track).id,
                        ffi::text((*track).language),
                        ffi::text((*track).description),
                        codec,
                        channels,
                    ));
                }
                (self.api.libvlc_media_tracks_release)(list, count);
            }
            (self.api.libvlc_media_release)(media);
            result
        }
    }
    pub fn tracks(&self) -> (Vec<AudioTrack>, Option<i64>) {
        unsafe {
            let selected = (self.api.libvlc_audio_get_track)(self.handle);
            let first = (self.api.libvlc_audio_get_track_description)(self.handle);
            let metadata = self.media_audio_metadata();
            let _ = std::fs::write(
                std::env::temp_dir().join("discatelier-vlc-audio-meta.log"),
                format!("{metadata:?}"),
            );
            let mut descriptions = Vec::new();
            let mut entry = first;
            for _ in 0..1024 {
                if entry.is_null() {
                    break;
                }
                let track = &*entry;
                if track.id >= 0 {
                    descriptions.push((track.id, ffi::text(track.name)));
                }
                entry = track.next;
            }
            if !first.is_null() {
                (self.api.libvlc_track_description_list_release)(first);
            }
            // libVLC's audio description uses the Blu-ray PID (4352...), while
            // the media track list uses its own 1-based id. Match by id when
            // possible, otherwise by the stable audio order.
            let by_index = metadata.len() == descriptions.len();
            let tracks = descriptions
                .into_iter()
                .enumerate()
                .map(|(index, (id, name))| {
                    let extra = metadata
                        .iter()
                        .find(|(media_id, ..)| *media_id == id)
                        .or_else(|| by_index.then(|| &metadata[index]));
                    let description = extra
                        .map(|(_, _, description, ..)| description.clone())
                        .unwrap_or_default();
                    AudioTrack {
                        id: id as i64,
                        title: if description.is_empty() { name } else { description },
                        language: extra
                            .map(|(_, language, ..)| language.clone())
                            .unwrap_or_default(),
                        codec: extra
                            .map(|(_, _, _, codec, _)| codec.clone())
                            .unwrap_or_default(),
                        channels: extra.and_then(|(_, _, _, _, channels)| *channels),
                        selected: selected == id,
                    }
                })
                .collect();
            (tracks, (selected >= 0).then_some(selected as i64))
        }
    }
    fn apply_equalizer(&self, state: &StoredEqualizer, gain_db: f32) -> Result<(), AppError> {
        unsafe {
            if !state.enabled && gain_db >= 0.0 {
                return if (self.api.libvlc_media_player_set_equalizer)(self.handle, ptr::null_mut())
                    == 0
                {
                    Ok(())
                } else {
                    Err(ffi::error("均衡器应用失败。"))
                };
            }
            let equalizer = (self.api.libvlc_audio_equalizer_new)();
            if equalizer.is_null() {
                return Err(ffi::error("无法创建均衡器。"));
            }
            let flat = [0.0; 10];
            let (preamp, bands) = if state.enabled {
                (state.preamp, state.bands.as_slice())
            } else {
                (0.0, flat.as_slice())
            };
            (self.api.libvlc_audio_equalizer_set_preamp)(
                equalizer,
                (compensated_preamp(preamp) + gain_db).clamp(-20.0, 20.0),
            );
            for (index, gain) in bands.iter().enumerate().take(10) {
                (self.api.libvlc_audio_equalizer_set_amp_at_index)(
                    equalizer,
                    *gain as f32,
                    index as u32,
                );
            }
            let result = (self.api.libvlc_media_player_set_equalizer)(self.handle, equalizer);
            (self.api.libvlc_audio_equalizer_release)(equalizer);
            if result == 0 {
                Ok(())
            } else {
                Err(ffi::error("均衡器应用失败。"))
            }
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
                PlaybackControl::Chapter { index } => {
                    if snapshot.dvd_menu || snapshot.dvd_title.is_none() {
                        return Err(ffi::error("当前 DVD 画面没有章节。"));
                    }
                    let count = (self.api.libvlc_media_player_get_chapter_count)(self.handle);
                    if index == 0 || index as i32 > count {
                        return Err(ffi::error("DVD 章节不存在。"));
                    }
                    (self.api.libvlc_media_player_set_chapter)(self.handle, index as i32 - 1);
                }
                PlaybackControl::Title { index } => {
                    if !self
                        .titles()
                        .iter()
                        .any(|(id, _)| *id == index as i32)
                    {
                        return Err(ffi::error("蓝光标题不存在。"));
                    }
                    (self.api.libvlc_media_player_set_title)(self.handle, index as i32);
                }
                PlaybackControl::Audio { id } => {
                    if !snapshot.audio_tracks.iter().any(|track| track.id == id)
                        || (self.api.libvlc_audio_set_track)(self.handle, id as i32) != 0
                    {
                        return Err(ffi::error("此音轨当前不可切换。"));
                    }
                }
                PlaybackControl::Equalizer { enabled, preamp, bands } => {
                    if !preamp.is_finite() || !(-12.0..=12.0).contains(&preamp)
                        || bands.len() != 10
                        || bands.iter().any(|band| !band.is_finite() || !(-12.0..=12.0).contains(band))
                    {
                        return Err(ffi::error("均衡器参数无效。"));
                    }
                    let state = StoredEqualizer { enabled, preamp, bands };
                    *self
                        .equalizer
                        .lock()
                        .map_err(|_| ffi::error("均衡器状态不可用。"))? = Some(state.clone());
                    self.apply_equalizer(&state, 0.0)?;
                }
                PlaybackControl::Gain { db } => {
                    if !db.is_finite() || !(-20.0..=0.0).contains(&db) {
                        return Err(ffi::error("增益参数无效。"));
                    }
                    let state = self
                        .equalizer
                        .lock()
                        .map_err(|_| ffi::error("均衡器状态不可用。"))?
                        .clone()
                        .unwrap_or_else(|| StoredEqualizer {
                            enabled: false,
                            preamp: 0.0,
                            bands: vec![0.0; 10],
                        });
                    self.apply_equalizer(&state, db)?;
                }
                PlaybackControl::Menu { direction } => {
                    if !matches!(
                        snapshot.source.playlist.as_str(),
                        crate::DVD_MENU | crate::BD_MENU
                    ) {
                        return Err(ffi::error("当前光盘没有可导航菜单。"));
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
