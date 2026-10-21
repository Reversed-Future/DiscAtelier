pub(crate) mod images;
mod response;
#[cfg(test)]
mod tests;

use crate::{data_location::DataLocation, integration_settings};
use discatelier_contracts::AppError;
use discatelier_integration_http::{error, stream::stream_request};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    title: String,
    creator: String,
    images: Vec<String>,
}

fn body(request: &Request, model: &str) -> Result<Value, AppError> {
    if request.title.chars().count() > 200 || request.creator.chars().count() > 200 {
        return Err(error("收藏名称或作者过长。"));
    }
    images::validate(&request.images)?;
    let mut content = vec![json!({"type":"text", "text": format!(
        "当前收藏（仅用于区分商品，不是截图证据）：{}。以下依次为截图 1 至 {}。",
        json!({"title":request.title,"creator":request.creator}), request.images.len())})];
    for image in &request.images {
        content.push(json!({"type":"image_url","image_url":{"url":image,"detail":"high"}}));
    }
    Ok(json!({"model":model,"stream":false,"messages":[
        {"role":"system","content":include_str!("prompt.txt")},
        {"role":"user","content":content}
    ]}))
}

// This use case has no LibraryState or write tools. Only the ordinary form Save can persist.
#[tauri::command]
pub async fn purchase_recognize(
    directory: tauri::State<'_, DataLocation>,
    request: Request,
) -> Result<response::Recognition, AppError> {
    let directory = directory.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let settings = integration_settings::read(&directory)?;
        if settings.ai_base_url.is_empty() || settings.ai_model.is_empty() {
            return Err(error(
                "请先在设置中配置 AI 接口，并选择支持图片输入的模型。",
            ));
        }
        let body = body(&request, &settings.ai_model)?;
        let key = integration_settings::key(&settings.ai_base_url)?;
        let response = stream_request(
            &settings.ai_base_url,
            &body,
            key.as_deref(),
            &AtomicBool::new(false),
            |_| Err(error("识别接口未按请求返回完整 JSON。")),
        )
        .map_err(|e| {
            error(format!(
                "截图识别失败：{} 请确认设置中的模型支持图片输入。",
                e.message
            ))
        })?
        .ok_or_else(|| error("识别接口没有返回完整结果。"))?;
        response::parse(&response, request.images.len())
    })
    .await
    .map_err(|_| error("截图识别未完成，请重试。"))?
}
