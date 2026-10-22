use super::{error, AppError, DataLocation};
use crate::{integration_settings, purchase_recognition::images};
use discatelier_integration_http::stream::stream_request;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKey {
    Title,
    Creator,
    EditionLabel,
    Barcode,
    CatalogNumber,
    Territory,
    ReleaseDate,
    Volume,
    IncludedContent,
    Packaging,
    DiscCount,
    Carrier,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Field {
    pub key: FieldKey,
    pub value: String,
    pub evidence: String,
    pub image: usize,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Recognition {
    pub fields: Vec<Field>,
    pub warning: String,
}
pub(super) fn parse(response: &Value, count: usize) -> Result<Recognition, AppError> {
    let invalid = || error("识别结果格式或证据无效，未填写表单，请重试或手动填写。");
    if response
        .pointer("/choices/0/finish_reason")
        .and_then(Value::as_str)
        != Some("stop")
    {
        return Err(invalid());
    }
    let text = response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(invalid)?;
    if text.len() > 40000 {
        return Err(invalid());
    }
    let result: Recognition = serde_json::from_str(text).map_err(|_| invalid())?;
    if result.fields.len() > 12 || result.warning.len() > 2000 {
        return Err(invalid());
    }
    let mut keys = Vec::new();
    for field in &result.fields {
        if keys.contains(&field.key)
            || field.image == 0
            || field.image > count
            || field.value.trim().is_empty()
            || field.value.len() > 4000
            || field.evidence.trim().is_empty()
            || field.evidence.len() > 2000
            || field.value.contains('\0')
            || field.evidence.contains('\0')
        {
            return Err(invalid());
        }
        keys.push(field.key);
        let max = match field.key {
            FieldKey::Title
            | FieldKey::Creator
            | FieldKey::EditionLabel
            | FieldKey::Barcode
            | FieldKey::CatalogNumber
            | FieldKey::Territory
            | FieldKey::Volume => 200,
            FieldKey::Packaging => 2000,
            _ => 4000,
        };
        if field.value.chars().count() > max {
            return Err(invalid());
        }
        if field.key == FieldKey::DiscCount
            && field
                .value
                .parse::<usize>()
                .ok()
                .filter(|n| *n > 0 && *n <= 30)
                .is_none()
        {
            return Err(invalid());
        }
        if field.key == FieldKey::Carrier
            && !["bd", "dvd", "cd", "other"].contains(&field.value.as_str())
        {
            return Err(invalid());
        }
        if field.key == FieldKey::ReleaseDate
            && chrono::NaiveDate::parse_from_str(&field.value, "%Y-%m-%d").is_err()
        {
            return Err(invalid());
        }
    }
    Ok(result)
}
// Read-only recognition. The result cannot execute tools or write collection data.
#[tauri::command]
pub async fn video_recognize(
    directory: tauri::State<'_, DataLocation>,
    pictures: Vec<String>,
) -> Result<Recognition, AppError> {
    let directory = directory.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        images::validate(&pictures)?;
        let settings=integration_settings::read(&directory)?;
        if settings.ai_base_url.is_empty()||settings.ai_model.is_empty() {return Err(error("请先在设置 → 助手中配置支持图片的 AI 模型。"));}
        let mut content=vec![json!({"type":"text","text":format!("以下依次为包装图片 1 至 {}，只提取图片可见信息。",pictures.len())})];
        for picture in &pictures {content.push(json!({"type":"image_url","image_url":{"url":picture,"detail":"high"}}));}
        let body=json!({"model":settings.ai_model,"stream":false,"messages":[{"role":"system","content":include_str!("packaging-prompt.txt")},{"role":"user","content":content}]});
        let key=integration_settings::key(&settings.ai_base_url)?;
        let response=stream_request(&settings.ai_base_url,&body,key.as_deref(),&AtomicBool::new(false),|_|Err(error("识别接口未返回完整 JSON。")))?.ok_or_else(||error("识别接口未返回结果。"))?;
        parse(&response,pictures.len())
    }).await.map_err(|_|error("包装识别未完成，请重试。"))?
}
