//! Optional startup work stays off the window/setup thread.
use discatelier_netease_runtime::Runtime;
use std::{path::Path, path::PathBuf, sync::Arc};

fn enabled(directory: &Path) -> bool {
    crate::integration_settings::read(directory).is_ok_and(|settings| {
        settings.netease_mode == crate::integration_settings::NeteaseMode::Builtin
    })
}

pub fn schedule(runtime: Arc<Runtime>, directory: PathBuf) {
    tauri::async_runtime::spawn_blocking(move || {
        if enabled(&directory) {
            // Failure is non-fatal; a real request will retry through Runtime.
            let _ = runtime.warmup();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_builtin_settings_enable_startup() {
        let directory =
            std::env::temp_dir().join(format!("netease-startup-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        assert!(enabled(&directory));
        let path = directory.join("integration-settings.json");
        std::fs::write(&path, r#"{"neteaseMode":"custom","neteaseBaseUrl":"http://127.0.0.1:3000","aiBaseUrl":"","aiModel":""}"#).unwrap();
        assert!(!enabled(&directory));
        std::fs::write(
            &path,
            r#"{"neteaseBaseUrl":"http://127.0.0.1:3000","aiBaseUrl":"","aiModel":""}"#,
        )
        .unwrap();
        assert!(!enabled(&directory));
        std::fs::write(&path, "invalid").unwrap();
        assert!(!enabled(&directory));
    }
}
