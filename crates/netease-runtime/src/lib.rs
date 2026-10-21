//! Lazy, private-pipe Node runtime. Creating this manager never starts a process.
#[cfg(windows)]
mod job;
mod process;
#[cfg(test)]
mod tests;
use discatelier_contracts::AppError;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};

pub struct Runtime {
    root: PathBuf,
    cache: PathBuf,
    process: Mutex<Option<process::Process>>,
    closing: AtomicBool,
    timeout: Duration,
}
impl Runtime {
    pub fn new(root: PathBuf, cache: PathBuf) -> Self {
        Self {
            root,
            cache,
            process: Mutex::new(None),
            closing: AtomicBool::new(false),
            timeout: Duration::from_secs(35),
        }
    }
    pub fn request(&self, operation: &str, arguments: Value) -> Result<Value, AppError> {
        if operation == "search"
            && arguments
                .get("offset")
                .is_some_and(|v| v.as_u64().is_none_or(|n| n > u32::MAX as u64))
        {
            return Err(error("网易云搜索页码无效。"));
        }
        match operation {
            "search"
                if arguments
                    .get("query")
                    .and_then(Value::as_str)
                    .is_some_and(|q| !q.trim().is_empty() && q.len() <= 500) => {}
            "album"
                if arguments
                    .get("id")
                    .and_then(Value::as_u64)
                    .is_some_and(|id| id > 0 && id <= 9_007_199_254_740_991) => {}
            _ => return Err(error("网易云查询参数无效。")),
        }
        let mut process = self.process.lock().map_err(|_| error("内置服务不可用。"))?;
        if self.closing.load(Ordering::Acquire) {
            return Err(error("应用正在退出。"));
        }
        if process.as_mut().is_some_and(process::Process::exited) {
            process.take();
        }
        if process.is_none() {
            *process = Some(process::Process::spawn(&self.root, &self.cache)?);
        }
        let result = process.as_mut().unwrap().exchange(&json!({"id":uuid::Uuid::new_v4().to_string(),"operation":operation,"arguments":arguments}), &self.closing, self.timeout);
        if result.is_err() {
            process.take();
        }
        result
    }
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::Release);
        if let Ok(mut process) = self.process.lock() {
            process.take();
        }
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn error(message: &str) -> AppError {
    AppError::new("netease", message)
}
