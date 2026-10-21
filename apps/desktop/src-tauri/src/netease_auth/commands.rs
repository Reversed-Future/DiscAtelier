use super::{
    credentials::WindowsVault,
    error,
    protocol::{Account, Poll, QrImage},
    Auth,
};
use crate::{
    data_location::DataLocation,
    integration_settings::{self, NeteaseMode},
};
use discatelier_contracts::AppError;
use discatelier_netease_runtime::Runtime;
use std::sync::Arc;

fn builtin(directory: &DataLocation) -> Result<(), AppError> {
    if integration_settings::read(&directory.0)?.netease_mode != NeteaseMode::Builtin {
        return Err(error("扫码登录用于内置网易云服务，请先保存服务设置。"));
    }
    Ok(())
}
#[tauri::command]
pub async fn netease_account_status(
    directory: tauri::State<'_, DataLocation>,
    auth: tauri::State<'_, Arc<Auth>>,
    runtime: tauri::State<'_, Arc<Runtime>>,
) -> Result<Account, AppError> {
    builtin(&directory)?;
    let auth = auth.inner().clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        auth.status(&WindowsVault, &|op, args| runtime.request(op, args))
    })
    .await
    .map_err(|_| error("登录状态读取未完成。"))?
}
#[tauri::command]
pub async fn netease_login_begin(
    directory: tauri::State<'_, DataLocation>,
    auth: tauri::State<'_, Arc<Auth>>,
    runtime: tauri::State<'_, Arc<Runtime>>,
    request_id: String,
) -> Result<QrImage, AppError> {
    builtin(&directory)?;
    let auth = auth.inner().clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        auth.begin(request_id, &|op, args| runtime.request(op, args))
    })
    .await
    .map_err(|_| error("二维码读取未完成。"))?
}
#[tauri::command]
pub async fn netease_login_poll(
    directory: tauri::State<'_, DataLocation>,
    auth: tauri::State<'_, Arc<Auth>>,
    runtime: tauri::State<'_, Arc<Runtime>>,
    request_id: String,
) -> Result<Poll, AppError> {
    builtin(&directory)?;
    let auth = auth.inner().clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        auth.poll(&request_id, &WindowsVault, &|op, args| {
            runtime.request(op, args)
        })
    })
    .await
    .map_err(|_| error("扫码确认未完成。"))?
}
#[tauri::command]
pub fn netease_login_cancel(
    auth: tauri::State<'_, Arc<Auth>>,
    request_id: String,
) -> Result<(), AppError> {
    auth.cancel(&request_id)
}
#[tauri::command]
pub async fn netease_account_logout(
    auth: tauri::State<'_, Arc<Auth>>,
    runtime: tauri::State<'_, Arc<Runtime>>,
) -> Result<Account, AppError> {
    let auth = auth.inner().clone();
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        auth.logout(&WindowsVault, &|op, args| runtime.request(op, args))
    })
    .await
    .map_err(|_| error("退出登录未完成。"))?
}
