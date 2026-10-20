//! Opt-in diagnostics; never records paths, model data or collection fields.
use std::{io::Write, time::Instant};

pub struct Span {
    stage: &'static str,
    start: Instant,
}
impl Span {
    pub fn new(stage: &'static str) -> Self {
        Self {
            stage,
            start: Instant::now(),
        }
    }
}
impl Drop for Span {
    fn drop(&mut self) {
        let Some(path) = std::env::var_os("DISCATELIER_PROFILE_LOG") else {
            return;
        };
        let record = serde_json::json!({
            "stage": self.stage,
            "ms": self.start.elapsed().as_secs_f64() * 1000.0,
            "thread": format!("{:?}", std::thread::current().id()),
        });
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(file, "{record}");
        }
    }
}
pub fn measure<T>(stage: &'static str, task: impl FnOnce() -> T) -> T {
    let _span = Span::new(stage);
    task()
}
