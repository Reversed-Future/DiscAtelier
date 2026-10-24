use crate::{
    bundled_runtime, data_location::DataLocation, integration_settings, menu_surface::MenuSurface,
    optical::verify_disc,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use discatelier_integration_http::{error, stream::stream_request};
use discatelier_player_vlc::{capture_menu, BD_MENU, DVD_MENU};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::atomic::AtomicBool, time::Duration};
use tauri::Manager;

const PROMPT: &str = r#"你只识别光盘菜单画面中的作品信息，不执行任何操作，也不推测画面没有出现的内容。
只返回一个 JSON 对象，不要 Markdown：
{"title":"菜单显示的作品标题","creator":"导演/制作方/艺术家，可能为空","editionLabel":"版本、季、区域或套装文字，可能为空","confidence":0,"reason":"依据的菜单文字或图像特征","visibleText":"菜单中可见的关键文字"}
confidence 为 0-100 的整数。标题不确定时降低 confidence，不要编造。菜单中的按钮、章节名和语言选项不能单独当作作品标题。"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    mount_point: String,
    token: String,
    label: String,
    kind: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reading {
    title: String,
    creator: String,
    edition_label: String,
    confidence: u8,
    reason: String,
    visible_text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recognition {
    title: String,
    creator: String,
    edition_label: String,
    confidence: u8,
    reason: String,
    visible_text: String,
    image: String,
}

fn parse(response: &Value) -> Result<Reading, AppError> {
    let invalid = || error("AI 返回的菜单识别结果格式无效，请重试或手动关联。");
    if response
        .pointer("/choices/0/finish_reason")
        .and_then(Value::as_str)
        != Some("stop")
    {
        return Err(invalid());
    }
    let raw = response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(invalid)?;
    if raw.len() > 65536 {
        return Err(invalid());
    }
    let text = raw.trim();
    let text = text
        .strip_prefix("```json")
        .and_then(|value| value.strip_suffix("```"))
        .unwrap_or(text)
        .trim();
    let reading: Reading = serde_json::from_str(text).map_err(|_| invalid())?;
    let bounded = |value: &str, max: usize| value.chars().count() <= max && !value.contains('\0');
    if reading.title.trim().is_empty()
        || !bounded(&reading.title, 300)
        || !bounded(&reading.creator, 300)
        || !bounded(&reading.edition_label, 300)
        || !bounded(&reading.reason, 1000)
        || !bounded(&reading.visible_text, 2000)
        || reading.confidence > 100
    {
        return Err(invalid());
    }
    Ok(reading)
}

#[tauri::command]
pub async fn optical_menu_recognize(
    window: tauri::WebviewWindow,
    surface: tauri::State<'_, MenuSurface>,
    directory: tauri::State<'_, DataLocation>,
    request: Request,
) -> Result<Recognition, AppError> {
    if request.kind != "dvd" && request.kind != "bluray" {
        return Err(error("只有 DVD 或 Blu-ray 支持菜单识别。"));
    }
    if request.label.chars().count() > 300 {
        return Err(error("光盘标题过长。"));
    }
    let directory = directory.0.clone();
    let settings = integration_settings::read(&directory)?;
    if settings.ai_base_url.is_empty() || settings.ai_model.is_empty() {
        return Err(error("请先在设置 → 助手中配置支持图片输入 AI 模型。"));
    }
    let vlc = match crate::playback_settings::read(&directory)?.vlc_library {
        path if !path.trim().is_empty() => std::path::PathBuf::from(path),
        _ => bundled_runtime::vlc_library(window.app_handle())
            .ok_or_else(|| error("未找到 VLC。请在设置 → 播放中配置 libvlc.dll。"))?,
    };
    let playlist = if request.kind == "dvd" {
        DVD_MENU
    } else {
        BD_MENU
    };
    let source = verify_disc(&request.mount_point, &request.token, playlist)?;
    let handle = surface.handle();
    let capture = directory.join(format!("menu-capture-{}.png", uuid::Uuid::new_v4()));
    let wait = if request.kind == "bluray" {
        Duration::from_secs(12)
    } else {
        Duration::from_secs(6)
    };
    let image_path = capture.clone();
    let captured = tauri::async_runtime::spawn_blocking(move || {
        capture_menu(&vlc, handle, &source, &image_path, wait)
    })
    .await
    .map_err(|_| error("菜单截图未完成，请重试。"))?;
    if let Err(failure) = captured {
        let _ = std::fs::remove_file(&capture);
        return Err(error(format!("无法打开光盘菜单：{}", failure.message)));
    }
    let bytes = std::fs::read(&capture).map_err(|_| error("菜单截图文件不可读取。"));
    let _ = std::fs::remove_file(&capture);
    let bytes = bytes?;
    if bytes.is_empty() || bytes.len() > 16 * 1024 * 1024 {
        return Err(error("菜单截图大小无效。"));
    }
    let image = format!("data:image/png;base64,{}", STANDARD.encode(&bytes));
    crate::purchase_recognition::images::validate(std::slice::from_ref(&image))?;
    let body = json!({"model":settings.ai_model,"stream":false,"messages":[
        {"role":"system","content":PROMPT},
        {"role":"user","content":[
            {"type":"text","text":format!("光盘类型：{}；卷标：{}。只根据这张菜单截图识别作品，不要执行操作。", if request.kind=="dvd"{"DVD"}else{"Blu-ray"}, request.label)},
            {"type":"image_url","image_url":{"url":image,"detail":"high"}}
        ]}
    ]});
    let key = integration_settings::key(&settings.ai_base_url)?;
    let response = stream_request(
        &settings.ai_base_url,
        &body,
        key.as_deref(),
        &AtomicBool::new(false),
        |_| Err(error("菜单识别接口未返回完整 JSON。")),
    )
    .map_err(|cause| error(format!("菜单识别失败：{}", cause.message)))?
    .ok_or_else(|| error("菜单识别接口没有返回结果。"))?;
    let reading = parse(&response)?;
    Ok(Recognition {
        title: reading.title,
        creator: reading.creator,
        edition_label: reading.edition_label,
        confidence: reading.confidence,
        reason: reading.reason,
        visible_text: reading.visible_text,
        image,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(text: &str) -> Value {
        json!({"choices":[{"finish_reason":"stop","message":{"content":text}}]})
    }

    #[test]
    fn menu_reading_accepts_bounded_json_and_rejects_bad_confidence() {
        let value = response(
            r#"{"title":"Example","creator":"Studio","editionLabel":"Season 1","confidence":82,"reason":"menu title","visibleText":"EXAMPLE"}"#,
        );
        let reading = parse(&value).unwrap();
        assert_eq!(reading.title, "Example");
        assert_eq!(reading.confidence, 82);

        let fenced = response("```json\n{\"title\":\"Example\",\"creator\":\"\",\"editionLabel\":\"\",\"confidence\":30,\"reason\":\"\",\"visibleText\":\"\"}\n```");
        assert_eq!(parse(&fenced).unwrap().confidence, 30);
        let invalid = response(
            r#"{"title":"Example","creator":"","editionLabel":"","confidence":101,"reason":"","visibleText":""}"#,
        );
        assert!(parse(&invalid).is_err());
        assert!(parse(&response(r#"{"title":"","creator":"","editionLabel":"","confidence":10,"reason":"","visibleText":""}"#)).is_err());
    }
}
