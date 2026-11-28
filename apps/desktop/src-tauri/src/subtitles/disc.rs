use super::disc_ocr::recognize_bitmap;
use super::{active_job, error, snapshot, translation, Jobs};
use crate::{data_location::DataLocation, integration_settings, playback::PlaybackState};
use discatelier_contracts::AppError;
use discatelier_player_vlc::captions::Capture;
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use windows::Media::Ocr::OcrEngine;

#[tauri::command]
pub fn subtitle_capture_mode(
    playback: tauri::State<'_, PlaybackState>,
    session: String,
    mode: String,
) -> Result<(), AppError> {
    let s = snapshot(&playback)?;
    if s.session_id != session {
        return Err(error("播放会话已切换。"));
    }
    let mode = match mode.as_str() {
        "off" => 0,
        "styled" => 1,
        "listen" => 2,
        _ => return Err(error("无效的字幕模式。")),
    };
    Capture::current(&session)?.set_mode(mode)
}
#[derive(Serialize)]
pub struct OcrLanguage {
    tag: String,
    name: String,
}
#[tauri::command]
pub fn subtitle_ocr_languages() -> Result<Vec<OcrLanguage>, AppError> {
    let languages = OcrEngine::AvailableRecognizerLanguages()
        .map_err(|e| error(format!("无法读取 Windows OCR 语言：{e}")))?;
    let mut out = Vec::new();
    for lang in languages {
        out.push(OcrLanguage {
            tag: lang
                .LanguageTag()
                .map_err(|e| error(e.to_string()))?
                .to_string(),
            name: lang
                .NativeName()
                .map_err(|e| error(e.to_string()))?
                .to_string(),
        });
    }
    Ok(out)
}
#[derive(Serialize)]
pub struct ReadFrame {
    version: i32,
    text: String,
}
#[tauri::command]
pub async fn subtitle_disc_frame(
    playback: tauri::State<'_, PlaybackState>,
    session: String,
    previous: i32,
    language: String,
) -> Result<ReadFrame, AppError> {
    let s = snapshot(&playback)?;
    if s.session_id != session || !s.phase.active() {
        return Err(error("播放会话已切换。"));
    }
    let frame = Capture::current(&session)?.frame(previous, s.paused);
    let Some((w, h, data)) = frame.bitmap else {
        return Ok(ReadFrame {
            version: frame.version,
            text: frame.text,
        });
    };
    let version = frame.version;
    if language.is_empty() {
        return Err(error(
            "这条字幕轨是图形字幕。请选择与原片相符的文字识别语言，再使用应用字幕样式。",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        Ok(ReadFrame {
            version,
            text: recognize_bitmap(&language, w, h, &data)?,
        })
    })
    .await
    .map_err(|_| error("原盘字幕识别中断。"))?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires a subtitle region captured from a playing disc and a Windows OCR language pack"]
    fn recognize_captured_pgs() {
        let languages = subtitle_ocr_languages()
            .unwrap()
            .into_iter()
            .map(|l| l.tag)
            .collect::<Vec<_>>();
        println!("Installed OCR languages {languages:?}");
        let bytes = std::fs::read(std::env::var_os("SUBTITLE_TEST_PGM").unwrap()).unwrap();
        let mut header = bytes.splitn(4, |&b| b == b'\n');
        assert_eq!(header.next().unwrap(), b"P5");
        let size = std::str::from_utf8(header.next().unwrap())
            .unwrap()
            .split_whitespace()
            .map(|n| n.parse().unwrap())
            .collect::<Vec<i32>>();
        assert_eq!(header.next().unwrap(), b"255");
        let lang = std::env::var("SUBTITLE_TEST_LANG").unwrap();
        let text = recognize_bitmap(&lang, size[0], size[1], header.next().unwrap()).unwrap();
        assert!(!text.trim().is_empty());
        println!("OCR result {text}");
    }
}

#[tauri::command]
pub async fn subtitle_live_dialogue(
    jobs: tauri::State<'_, Jobs>,
    playback: tauri::State<'_, PlaybackState>,
    id: String,
) -> Result<Option<String>, AppError> {
    let job = active_job(&jobs, &id, &playback)?;
    if !job.video.as_os_str().is_empty() {
        return Err(error("当前为本地视频。"));
    }
    let Some(samples) = Capture::current(&job.session)?.audio() else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || {
        Ok(Some(
            job.engine
                .recognize_live(&samples, &job.stop)?
                .into_iter()
                .map(|cue| cue.text)
                .collect::<Vec<_>>()
                .join(" "),
        ))
    })
    .await
    .map_err(|_| error("听译已中断。"))?
}
#[tauri::command]
pub async fn subtitle_text_translation(
    playback: tauri::State<'_, PlaybackState>,
    directory: tauri::State<'_, DataLocation>,
    session: String,
    text: String,
) -> Result<String, AppError> {
    let s = snapshot(&playback)?;
    if !s.phase.active() || s.session_id != session || text.trim().is_empty() || text.len() > 16384
    {
        return Err(error("字幕或播放会话无效。"));
    }
    let ai = integration_settings::read(&directory.0)?;
    if ai.ai_base_url.is_empty() || ai.ai_model.is_empty() {
        return Err(error("请在设置 → AI 助手与翻译配置翻译服务。"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let result = translation::translate(
            &ai.ai_base_url,
            &ai.ai_model,
            &[text],
            &AtomicBool::new(false),
        )?;
        result
            .into_iter()
            .next()
            .ok_or_else(|| error("未收到译文。"))
    })
    .await
    .map_err(|_| error("翻译已中断。"))?
}
