use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tokio::sync::{Notify, Semaphore};

pub const LIFETIME: Duration = Duration::from_secs(15 * 60);
pub const BODY_LIMIT: usize = 24 * 1024 * 1024 + 65536;
pub fn error(message: impl Into<String>) -> AppError {
    AppError::new("mobile", message)
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    Barcode,
    Screenshots,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Payload {
    Barcode { value: String },
    Screenshots { images: Vec<String> },
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Submission {
    pub id: String,
    pub payload: Payload,
}
pub struct Inbox {
    pub received: Option<Payload>,
    pub receipt: Option<(String, String)>,
}
pub struct Session {
    pub id: String,
    pub token: String,
    pub host: String,
    pub mode: Mode,
    pub max_images: usize,
    pub created: Instant,
    pub heartbeat: Mutex<Instant>,
    pub closed: AtomicBool,
    pub connected: AtomicBool,
    pub inbox: Mutex<Inbox>,
    pub uploads: std::sync::Arc<Semaphore>,
    pub shutdown: Notify,
}
impl Session {
    pub fn live(&self) -> bool {
        !self.closed.load(Ordering::Acquire)
            && self.created.elapsed() < LIFETIME
            && self
                .heartbeat
                .lock()
                .is_ok_and(|time| time.elapsed() < Duration::from_secs(45))
    }
    pub fn stop(&self) {
        self.closed.store(true, Ordering::Release);
        if let Ok(mut inbox) = self.inbox.lock() {
            inbox.received = None;
        }
        self.shutdown.notify_one();
    }
    pub fn validate(&self, payload: &Payload) -> Result<(), AppError> {
        match (self.mode, payload) {
            (Mode::Barcode, Payload::Barcode { value }) if valid_barcode(value) => Ok(()),
            (Mode::Screenshots, Payload::Screenshots { images })
                if images.len() <= self.max_images =>
            {
                crate::purchase_recognition::images::validate(images)
            }
            _ => Err(error("内容与当前接收入口不符，或条码／图片数量无效。")),
        }
    }
}
// EAN-8, UPC-A and EAN-13 use the same right-to-left GS1 check digit calculation.
pub fn valid_barcode(value: &str) -> bool {
    if ![8, 12, 13].contains(&value.len()) || !value.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let sum: u32 = value
        .bytes()
        .rev()
        .enumerate()
        .map(|(i, b)| u32::from(b - b'0') * if i % 2 == 0 { 1 } else { 3 })
        .sum();
    sum.is_multiple_of(10)
}
