use discatelier_contracts::AppError;
use discatelier_integration_http::{endpoint, error};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path};

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    #[serde(default)]
    pub netease_mode: NeteaseMode,
    pub netease_base_url: String,
    pub ai_base_url: String,
    pub ai_model: String,
    /// MusicBrainz web service root; empty means the public endpoint.
    #[serde(default)]
    pub musicbrainz_base_url: String,
}
#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NeteaseMode {
    #[default]
    Builtin,
    Custom,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub settings: Settings,
    pub has_key: bool,
}
pub fn read(directory: &Path) -> Result<Settings, AppError> {
    let file = match std::fs::File::open(directory.join("integration-settings.json")) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Settings::default()),
        Err(_) => return Err(error("无法读取接口设置。")),
    };
    let mut text = String::new();
    file.take(16385)
        .read_to_string(&mut text)
        .map_err(|_| error("无法读取接口设置。"))?;
    if text.len() > 16384 {
        return Err(error("接口设置过长。"));
    }
    let raw: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| error("接口设置格式错误。"))?;
    let legacy = raw.get("neteaseMode").is_none();
    let mut settings: Settings =
        serde_json::from_value(raw).map_err(|_| error("接口设置格式错误。"))?;
    if legacy && !settings.netease_base_url.is_empty() {
        settings.netease_mode = NeteaseMode::Custom;
    }
    Ok(settings)
}
fn entry(base: &str) -> Result<keyring::Entry, AppError> {
    let service = "com.reversedfuture.discatelier";
    #[cfg(any(debug_assertions, feature = "performance-harness"))]
    let service = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
        "com.reversedfuture.discatelier.integration-test"
    } else {
        service
    };
    let binding = endpoint(base, "chat/completions")?;
    keyring::Entry::new(
        service,
        &format!("ai-{:x}", Sha256::digest(binding.as_str())),
    )
    .map_err(|_| error("无法访问凭据管理器。"))
}
pub fn key(base: &str) -> Result<Option<String>, AppError> {
    if base.is_empty() {
        return Ok(None);
    }
    match entry(base)?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(error("无法读取 AI 密钥。")),
    }
}
#[tauri::command]
pub fn integration_settings_get(
    directory: tauri::State<'_, crate::data_location::DataLocation>,
) -> Result<Status, AppError> {
    let settings = read(&directory.0)?;
    let has_key = key(&settings.ai_base_url)?.is_some();
    Ok(Status { settings, has_key })
}
#[tauri::command]
pub fn integration_settings_save(
    directory: tauri::State<'_, crate::data_location::DataLocation>,
    settings: Settings,
    api_key: Option<String>,
    forget_key: bool,
) -> Result<Status, AppError> {
    if settings.netease_mode == NeteaseMode::Custom {
        endpoint(&settings.netease_base_url, "album")?;
    }
    if !settings.ai_base_url.is_empty() {
        endpoint(&settings.ai_base_url, "chat/completions")?;
    }
    if !settings.musicbrainz_base_url.is_empty() {
        endpoint(&settings.musicbrainz_base_url, "discid/X")?;
    }
    if settings.ai_model.len() > 200 || settings.ai_model.chars().any(char::is_control) {
        return Err(error("模型名称无效。"));
    }
    if let Some(value) = api_key.filter(|s| !s.is_empty()) {
        if value.len() > 4096
            || value.chars().any(char::is_whitespace)
            || value.chars().any(char::is_control)
        {
            return Err(error("密钥格式无效。"));
        }
        entry(&settings.ai_base_url)?
            .set_password(&value)
            .map_err(|_| error("无法保存密钥。"))?;
    } else if forget_key && !settings.ai_base_url.is_empty() {
        match entry(&settings.ai_base_url)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err(error("无法移除密钥。")),
        }
    }
    let path = directory.0.join(format!(
        "integration-settings-{}.json",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(
        &path,
        serde_json::to_vec(&settings).map_err(|_| error("无法保存设置。"))?,
    )
    .map_err(|_| error("无法保存设置。"))?;
    std::fs::rename(path, directory.0.join("integration-settings.json"))
        .map_err(|_| error("无法替换设置。"))?;
    Ok(Status {
        has_key: key(&settings.ai_base_url)?.is_some(),
        settings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mode_defaults_to_builtin_and_preserves_existing_custom_settings() {
        let path = std::env::temp_dir().join(format!("discatelier-mode-{}", uuid::Uuid::new_v4()));
        assert!(read(&path).unwrap().netease_mode == NeteaseMode::Builtin);
        std::fs::create_dir_all(&path).unwrap();
        let file = path.join("integration-settings.json");
        std::fs::write(
            &file,
            r#"{"neteaseBaseUrl":"http://127.0.0.1:3000","aiBaseUrl":"","aiModel":""}"#,
        )
        .unwrap();
        assert!(read(&path).unwrap().netease_mode == NeteaseMode::Custom);
        std::fs::write(&file, r#"{"neteaseMode":"builtin","neteaseBaseUrl":"http://127.0.0.1:3000","aiBaseUrl":"","aiModel":""}"#).unwrap();
        assert!(read(&path).unwrap().netease_mode == NeteaseMode::Builtin);
        std::fs::write(
            &file,
            r#"{"neteaseMode":"invalid","neteaseBaseUrl":"","aiBaseUrl":"","aiModel":""}"#,
        )
        .unwrap();
        assert!(read(&path).is_err());
    }
}
