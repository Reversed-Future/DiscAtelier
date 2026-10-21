mod credentials;
mod model;
mod provider;
mod storage;
#[cfg(test)]
mod tests;

use crate::data_location::DataLocation;
use discatelier_contracts::AppError;
use model::{error, status, Cache, Document, Quote, Settings, Status, CURRENCIES};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};

#[derive(Default)]
pub struct ExchangeState(Mutex<()>);
fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[tauri::command]
pub fn exchange_open_docs(app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://www.apihz.cn/api/jinronghuilv.html", None::<&str>)
        .map_err(|_| error("无法打开汇率接口说明。"))
}

/// Record the attempt before fetching so restarts and failed requests don't create a request loop.
fn refresh(
    directory: &Path,
    mut document: Document,
    date: &str,
    now: i64,
    force: bool,
    mut fetch: impl FnMut(&str, &str) -> Result<Quote, AppError>,
) -> Result<Document, AppError> {
    if !model::due(&document, date, now, force) {
        return Ok(document);
    }
    if document.cache.target != document.settings.target {
        document.cache = Cache {
            target: document.settings.target.clone(),
            ..Default::default()
        };
    }
    document.cache.attempt_date = date.into();
    document.cache.last_attempt_at = now;
    document.cache.last_error.clear();
    storage::write(directory, &document)?;
    for from in CURRENCIES
        .into_iter()
        .filter(|v| *v != document.settings.target)
    {
        match fetch(from, &document.settings.target) {
            Ok(quote) => {
                quote.validate()?;
                if quote.from != from || quote.to != document.settings.target {
                    return Err(error("汇率币种不一致。"));
                }
                document.cache.rates.retain(|r| r.from != from);
                document.cache.rates.push(quote);
            }
            Err(e) => {
                document.cache.last_error = e.message;
                break;
            }
        }
    }
    storage::write(directory, &document)?;
    Ok(document)
}

#[tauri::command]
pub async fn exchange_status(
    directory: tauri::State<'_, DataLocation>,
) -> Result<Status, AppError> {
    let directory = directory.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let document = storage::read(&directory)?;
        let has_key = credentials::read(&document.settings.developer_id)?.is_some();
        Ok(status(document, has_key, today()))
    })
    .await
    .map_err(|_| error("汇率状态读取未完成。"))?
}

#[tauri::command]
pub async fn exchange_refresh(
    directory: tauri::State<'_, DataLocation>,
    state: tauri::State<'_, Arc<ExchangeState>>,
    force: bool,
) -> Result<Status, AppError> {
    let directory = directory.0.clone();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.0.lock().map_err(|_| error("汇率服务不可用。"))?;
        let document = storage::read(&directory)?;
        let date = today();
        let key = credentials::read(&document.settings.developer_id)?;
        if !document.settings.enabled {
            return Ok(status(document, key.is_some(), date));
        }
        let Some(key) = key else {
            let mut value = status(document, false, date);
            value.error = "请先在设置中保存汇率 KEY。".into();
            return Ok(value);
        };
        if force
            && document.cache.last_attempt_at != 0
            && chrono::Utc::now()
                .timestamp()
                .saturating_sub(document.cache.last_attempt_at)
                < 60
        {
            return Err(error("刚刚已请求汇率，请间隔一分钟后重试。"));
        }
        let id = document.settings.developer_id.clone();
        let updated = refresh(
            &directory,
            document,
            &date,
            chrono::Utc::now().timestamp(),
            force,
            |from, to| provider::fetch(&id, &key, from, to, &date),
        )?;
        Ok(status(updated, true, date))
    })
    .await
    .map_err(|_| error("汇率更新未完成。"))?
}

#[tauri::command]
pub async fn exchange_save(
    directory: tauri::State<'_, DataLocation>,
    state: tauri::State<'_, Arc<ExchangeState>>,
    mut settings: Settings,
    api_key: Option<String>,
    forget_key: bool,
) -> Result<Status, AppError> {
    let directory = directory.0.clone();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state.0.lock().map_err(|_| error("汇率服务不可用。"))?;
        if forget_key {
            settings.enabled = false;
        }
        settings.validate()?;
        let mut document = storage::read(&directory)?;
        let changed = document.settings.developer_id != settings.developer_id
            || document.settings.target != settings.target
            || document.settings.enabled != settings.enabled
            || api_key.as_ref().is_some_and(|k| !k.is_empty());
        if forget_key {
            credentials::forget(&settings.developer_id)?;
        } else if let Some(key) = api_key.filter(|v| !v.is_empty()) {
            if settings.developer_id.is_empty() {
                return Err(error("请先填写开发者 ID。"));
            }
            credentials::save(&settings.developer_id, &key)?;
        }
        let has_key = credentials::read(&settings.developer_id)?.is_some();
        if settings.enabled && !has_key {
            return Err(error("请先填写汇率 KEY。"));
        }
        if document.cache.target != settings.target {
            document.cache.rates.clear();
            document.cache.target = settings.target.clone();
        }
        if changed || forget_key {
            document.cache.attempt_date.clear();
            document.cache.last_error.clear();
        }
        document.settings = settings;
        storage::write(&directory, &document)?;
        Ok(status(document, has_key, today()))
    })
    .await
    .map_err(|_| error("汇率设置保存未完成。"))?
}
