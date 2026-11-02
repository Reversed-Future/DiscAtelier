use discatelier_contracts::AppError;
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_FIELD_CHARS: usize = 8_000;
const RECENT_LINES: usize = 160;

struct LogStore {
    directory: PathBuf,
    file: PathBuf,
    lock: Mutex<()>,
}

static STORE: OnceLock<LogStore> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogInfo {
    pub directory: String,
    pub file: String,
    pub bytes: u64,
    pub recent: String,
}

fn clean(value: &str) -> String {
    value
        .replace(['\r', '\n'], " ")
        .chars()
        .take(MAX_FIELD_CHARS)
        .collect::<String>()
}

/// Keep common credential forms out of support logs. The UI should never log
/// tokens, but third-party error text occasionally embeds request details.
fn redact(value: &str) -> String {
    let mut safe = value.to_owned();
    for marker in [
        "token=",
        "authorization:",
        "password=",
        "passwd=",
        "api_key=",
    ] {
        let mut search = 0;
        while let Some(found) = safe[search..].to_ascii_lowercase().find(marker) {
            let start = search + found + marker.len();
            let end = safe[start..]
                .find([' ', '&', '\n', '\r', '\t'])
                .map(|offset| start + offset)
                .unwrap_or(safe.len());
            safe.replace_range(start..end, "***");
            search = start + 3;
            if search >= safe.len() {
                break;
            }
        }
    }
    clean(&safe)
}

impl LogStore {
    fn append(&self, level: &str, scope: &str, message: &str, detail: Option<&str>) {
        let _guard = self.lock.lock().ok();
        let _ = fs::create_dir_all(&self.directory);
        let rotate = fs::metadata(&self.file)
            .map(|metadata| metadata.len() >= MAX_FILE_BYTES)
            .unwrap_or(false);
        if rotate {
            let previous = self.directory.join("discatelier.1.log");
            let _ = fs::remove_file(&previous);
            let _ = fs::rename(&self.file, previous);
        }
        let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file)
        else {
            return;
        };
        let timestamp = chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, false);
        let level = clean(level).to_ascii_uppercase();
        let scope = clean(scope);
        let message = redact(message);
        let _ = writeln!(file, "{timestamp} [{level}] [{scope}] {message}");
        if let Some(detail) = detail.filter(|value| !value.is_empty()) {
            let _ = writeln!(file, "  {}", redact(detail));
        }
    }
}

pub fn init(directory: &Path) -> Result<(), AppError> {
    let logs = directory.join("logs");
    fs::create_dir_all(&logs).map_err(|_| AppError::new("logging", "无法创建日志目录。"))?;
    let store = LogStore {
        directory: logs,
        file: directory.join("logs").join("discatelier.log"),
        lock: Mutex::new(()),
    };
    let _ = STORE.set(store);
    write(
        "info",
        "app",
        &format!(
            "DiscAtelier {} started on {}; data directory: {}",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            directory.display()
        ),
        None,
    );
    Ok(())
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| info.payload().downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown panic");
        let location = info
            .location()
            .map(|value| format!("{}:{}", value.file(), value.line()))
            .unwrap_or_default();
        write("error", "panic", payload, Some(&location));
    }));
}

pub fn write(level: &str, scope: &str, message: &str, detail: Option<&str>) {
    if let Some(store) = STORE.get() {
        store.append(level, scope, message, detail);
    } else {
        eprintln!("[{level}] [{scope}] {message}");
    }
}

fn store() -> Result<&'static LogStore, AppError> {
    STORE
        .get()
        .ok_or_else(|| AppError::new("logging", "日志系统尚未初始化。"))
}

fn recent(store: &LogStore) -> String {
    let Ok(bytes) = fs::read(&store.file) else {
        return String::new();
    };
    let text = String::from_utf8_lossy(&bytes);
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(RECENT_LINES)..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::redact;

    #[test]
    fn redacts_common_credentials_without_dropping_diagnostics() {
        let value = redact("request token=abc123&path=C:\\Music password=hunter2");
        assert!(!value.contains("abc123"));
        assert!(!value.contains("hunter2"));
        assert!(value.contains("path=C:\\Music"));
    }

    #[test]
    fn writes_a_readable_recent_log() {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../../target/logging-test");
        crate::logging::init(&dir).unwrap();
        crate::logging::write("error", "test", "smoke failure", Some("detail line"));
        let info = crate::logging::logs_info().unwrap();
        assert!(info.recent.contains("smoke failure"));
        assert!(info.recent.contains("detail line"));
    }
}

#[tauri::command]
pub fn log_write(
    level: String,
    scope: String,
    message: String,
    detail: Option<String>,
) -> Result<(), AppError> {
    if level.len() > 16 || scope.len() > 80 || message.is_empty() {
        return Err(AppError::new("validation", "日志字段无效。"));
    }
    write(&level, &scope, &message, detail.as_deref());
    Ok(())
}

#[tauri::command]
pub fn logs_info() -> Result<LogInfo, AppError> {
    let store = store()?;
    Ok(LogInfo {
        directory: store.directory.to_string_lossy().into_owned(),
        file: store.file.to_string_lossy().into_owned(),
        bytes: fs::metadata(&store.file)
            .map(|value| value.len())
            .unwrap_or(0),
        recent: recent(store),
    })
}

#[tauri::command]
pub fn logs_open(app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let store = store()?;
    app.opener()
        .open_path(store.directory.to_string_lossy(), None::<&str>)
        .map_err(|_| AppError::new("logging", "无法打开日志目录。"))
}

#[tauri::command]
pub fn logs_export(path: String) -> Result<String, AppError> {
    let store = store()?;
    let destination = PathBuf::from(path.trim());
    if !destination.is_absolute() || destination.parent().is_none() {
        return Err(AppError::new("logging", "日志导出路径无效。"));
    }
    if !store.file.is_file() {
        return Err(AppError::new("logging", "还没有可导出的日志。"));
    }
    fs::copy(&store.file, &destination).map_err(|_| AppError::new("logging", "无法导出日志。"))?;
    Ok(destination.to_string_lossy().into_owned())
}
