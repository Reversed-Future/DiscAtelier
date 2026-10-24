mod http;
mod session;
#[cfg(test)]
mod tests;
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use serde::Serialize;
use session::{error, Inbox, Mode, Payload, Session, LIFETIME};
use std::{
    net::{IpAddr, Ipv4Addr},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Instant,
};

#[derive(Default)]
pub struct Bridge(Mutex<Option<Arc<Session>>>);
impl Drop for Bridge {
    fn drop(&mut self) {
        if let Ok(Some(session)) = self.0.get_mut() {
            session.stop();
        }
    }
}
#[derive(Serialize)]
pub struct Address {
    ip: String,
    label: String,
}
#[tauri::command]
pub fn mobile_addresses() -> Result<Vec<Address>, AppError> {
    let preferred = local_ip_address::local_ip().ok();
    let mut addresses = local_ip_address::list_afinet_netifas()
        .map_err(|_| error("无法读取本机网络地址。"))?
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(ip) if ip.is_private() => Some(Address {
                ip: ip.to_string(),
                label: format!("{name} · {ip}"),
            }),
            _ => None,
        })
        .collect::<Vec<_>>();
    addresses.sort_by_key(|entry| {
        (
            entry.ip.parse::<IpAddr>().ok() != preferred,
            entry.ip.clone(),
        )
    });
    addresses.dedup_by(|a, b| a.ip == b.ip);
    Ok(addresses)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    id: String,
    url: String,
    qr_data_url: String,
    expires_at: i64,
}
#[derive(Serialize)]
pub struct Poll {
    connected: bool,
    received: Option<Payload>,
}

#[tauri::command]
pub async fn mobile_start(
    bridge: tauri::State<'_, Bridge>,
    address: String,
    mode: Mode,
    max_images: usize,
) -> Result<Connection, AppError> {
    if !mobile_addresses()?.iter().any(|entry| entry.ip == address)
        || !(1..=6).contains(&max_images)
    {
        return Err(error("请选择本机的局域网地址及有效图片数量。"));
    }
    let ip: Ipv4Addr = address.parse().map_err(|_| error("局域网地址无效。"))?;
    let listener = tokio::net::TcpListener::bind((ip, 0))
        .await
        .map_err(|_| error("无法打开手机接收端口，请检查网络权限。"))?;
    let host = listener
        .local_addr()
        .map_err(|_| error("无法读取接收端口。"))?
        .to_string();
    let session = Arc::new(Session {
        id: uuid::Uuid::new_v4().to_string(),
        token: format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ),
        host,
        mode,
        max_images,
        created: Instant::now(),
        heartbeat: Mutex::new(Instant::now()),
        closed: AtomicBool::new(false),
        connected: AtomicBool::new(false),
        inbox: Mutex::new(Inbox {
            received: None,
            receipt: None,
        }),
        uploads: Arc::new(tokio::sync::Semaphore::new(1)),
        shutdown: tokio::sync::Notify::new(),
    });
    let url = format!("http://{}/#{}", session.host, session.token);
    let qr = qrcode::QrCode::new(url.as_bytes())
        .map_err(|_| error("连接二维码生成失败。"))?
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(260, 260)
        .build();
    let connection = Connection {
        id: session.id.clone(),
        url,
        qr_data_url: format!("data:image/svg+xml;base64,{}", STANDARD.encode(qr)),
        expires_at: chrono::Utc::now().timestamp_millis() + LIFETIME.as_millis() as i64,
    };
    {
        let mut active = bridge.0.lock().map_err(|_| error("手机连接状态不可用。"))?;
        if let Some(previous) = active.replace(session.clone()) {
            previous.stop();
        }
    }
    http::serve(listener, session);
    Ok(connection)
}
#[tauri::command]
pub fn mobile_poll(bridge: tauri::State<'_, Bridge>, id: String) -> Result<Poll, AppError> {
    let active = bridge.0.lock().map_err(|_| error("手机连接状态不可用。"))?;
    let session = active
        .as_ref()
        .filter(|s| s.id == id && s.live())
        .ok_or_else(|| error("连接已结束或过期，请重新生成二维码。"))?;
    *session
        .heartbeat
        .lock()
        .map_err(|_| error("连接状态不可用。"))? = Instant::now();
    let received = session
        .inbox
        .lock()
        .map_err(|_| error("接收状态不可用。"))?
        .received
        .take();
    if received.is_some() && session.mode != Mode::Barcode {
        session.stop();
    }
    Ok(Poll {
        connected: session.connected.load(Ordering::Acquire),
        received,
    })
}
#[tauri::command]
pub fn mobile_stop(bridge: tauri::State<'_, Bridge>, id: String) -> Result<(), AppError> {
    let mut active = bridge.0.lock().map_err(|_| error("手机连接状态不可用。"))?;
    if active.as_ref().is_some_and(|s| s.id == id) {
        if let Some(session) = active.take() {
            session.stop();
        }
    }
    Ok(())
}
