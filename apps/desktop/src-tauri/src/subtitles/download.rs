use super::{error, models};
use crate::data_location::DataLocation;
use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    io::Write,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant},
};
use tauri::ipc::Channel;
use tokio::sync::{Mutex, MutexGuard};

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DownloadSource {
    #[default]
    HuggingFace,
    HfMirror,
}
impl DownloadSource {
    fn url(self, model: &models::Model) -> String {
        let host = match self {
            Self::HuggingFace => "huggingface.co",
            Self::HfMirror => "hf-mirror.com",
        };
        format!(
            "https://{host}/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin?download=true",
            model.id
        )
    }
}

#[derive(Default)]
pub struct Download {
    operation: Mutex<()>,
    cancelled: AtomicBool,
}
impl Download {
    pub(super) fn lock(&self) -> Result<MutexGuard<'_, ()>, AppError> {
        self.operation
            .try_lock()
            .map_err(|_| error("正在处理模型文件，请稍后重试。"))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    received: u64,
    total: u64,
    bytes_per_second: u64,
    remaining_seconds: Option<u64>,
}

struct SpeedMeter(VecDeque<(Instant, u64)>);
impl SpeedMeter {
    fn new(now: Instant) -> Self {
        Self(VecDeque::from([(now, 0)]))
    }
    fn sample(&mut self, now: Instant, received: u64, total: u64) -> Progress {
        while self.0.len() > 1 && now.duration_since(self.0[1].0) >= Duration::from_secs(4) {
            self.0.pop_front();
        }
        let (since, previous) = self.0[0];
        let elapsed = now.duration_since(since).as_secs_f64();
        let rate = if elapsed > 0.0 {
            ((received - previous) as f64 / elapsed).round() as u64
        } else {
            0
        };
        self.0.push_back((now, received));
        Progress {
            received,
            total,
            bytes_per_second: rate,
            remaining_seconds: (rate > 0).then(|| (total - received).div_ceil(rate)),
        }
    }
}

#[tauri::command]
pub fn subtitle_download_cancel(state: tauri::State<'_, Download>) {
    state.cancelled.store(true, Ordering::Release);
}
#[tauri::command]
pub async fn subtitle_download(
    directory: tauri::State<'_, DataLocation>,
    state: tauri::State<'_, Download>,
    id: String,
    source: Option<DownloadSource>,
    progress: Channel<Progress>,
) -> Result<(), AppError> {
    let m = models::model(&id)?;
    let _operation = state.lock()?;
    state.cancelled.store(false, Ordering::Release);
    if models::installed(&directory.0, m) {
        return Ok(());
    }
    let url = source.unwrap_or_default().url(m);
    let target = models::path(&directory.0, m);
    let dir = target.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|_| error("无法创建模型目录。"))?;
    let mut out = tempfile::NamedTempFile::new_in(dir).map_err(|_| error("无法写入模型目录。"))?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .read_timeout(Duration::from_secs(45))
        .build()
        .map_err(|_| error("无法建立下载连接。"))?;
    let received = AtomicU64::new(0);
    let transfer = async {
        let mut res = client
            .get(url)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|cause| {
                if let Some(status) = cause.status() {
                    error(format!(
                        "下载源返回 HTTP {}，请重试或切换下载源。",
                        status.as_u16()
                    ))
                } else if cause.is_timeout() {
                    error("连接下载源超时，请重试或切换下载源。")
                } else {
                    error("无法连接所选下载源，请检查网络或代理设置。")
                }
            })?;
        let mut hash = Sha256::new();
        let mut size = 0u64;
        while let Some(bytes) = res
            .chunk()
            .await
            .map_err(|_| error("模型下载中断，请重试或切换下载源。"))?
        {
            size += bytes.len() as u64;
            if size > m.bytes {
                return Err(error("模型大小校验失败。"));
            }
            hash.update(&bytes);
            out.write_all(&bytes)
                .map_err(|_| error("模型写入失败，请检查磁盘空间。"))?;
            received.store(size, Ordering::Relaxed);
        }
        if size != m.bytes || format!("{:x}", hash.finalize()) != m.sha {
            return Err(error("模型下载不完整或 SHA-256 不匹配，请重试。"));
        }
        if state.cancelled.load(Ordering::Acquire) {
            return Err(error("已取消下载。"));
        }
        out.persist(target)
            .map_err(|_| error("无法保存已验证的模型。"))?;
        Ok(())
    };
    tokio::pin!(transfer);
    let mut meter = SpeedMeter::new(Instant::now());
    let mut timer = tokio::time::interval(Duration::from_millis(500));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tokio::select! {
            biased;
            _ = timer.tick() => {
                if state.cancelled.load(Ordering::Acquire) { return Err(error("已取消下载。")); }
                let _ = progress.send(meter.sample(Instant::now(), received.load(Ordering::Relaxed), m.bytes));
            }
            result = &mut transfer => return result,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rate_and_eta_follow_actual_bytes_and_expire_on_stall() {
        let start = Instant::now();
        let mut meter = SpeedMeter::new(start);
        assert!(meter.sample(start, 0, 10000).remaining_seconds.is_none());
        let moving = meter.sample(start + Duration::from_secs(1), 2000, 10000);
        assert_eq!(
            (moving.bytes_per_second, moving.remaining_seconds),
            (2000, Some(4))
        );
        let stalled = meter.sample(start + Duration::from_secs(5), 2000, 10000);
        assert_eq!(
            (stalled.bytes_per_second, stalled.remaining_seconds),
            (0, None)
        );
    }
}
