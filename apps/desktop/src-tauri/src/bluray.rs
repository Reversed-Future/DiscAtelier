use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use discatelier_player_mpv::bluray;
use serde::Serialize;
use std::{
    io::{Cursor, Read},
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::ipc::Channel;

const MAX_ENCODED_KEYDB: usize = 12 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: usize = 64 * 1024 * 1024;
const KEYDB_DOWNLOAD_BASE: &str = "https://fvonline-db.bplaced.net/fv_download.php?lang=";

#[tauri::command]
pub async fn bluray_key_status() -> Result<bluray::KeydbStatus, AppError> {
    tauri::async_runtime::spawn_blocking(bluray::status)
        .await
        .map_err(|_| AppError::new("settings", "KEYDB.cfg 状态读取未完成。"))?
}

/// The frontend sends only the selected file's bytes, encoded as base64.
/// The command validates a bounded text key database, writes an atomic copy
/// into libaacs's standard `%APPDATA%\aacs` directory, and never returns or
/// logs key contents.
#[tauri::command]
pub async fn bluray_key_import(data: String) -> Result<bluray::KeydbImport, AppError> {
    if data.len() > MAX_ENCODED_KEYDB {
        return Err(AppError::new("validation", "KEYDB.cfg 超过导入大小限制。"));
    }
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| AppError::new("validation", "KEYDB.cfg 编码无效。"))?;
    let mut result = tauri::async_runtime::spawn_blocking(move || bluray::import(&bytes))
        .await
        .map_err(|_| AppError::new("settings", "KEYDB.cfg 导入未完成。"))??;
    mark_sources(&mut result, &["manual"]);
    Ok(result)
}

fn mark_sources(result: &mut bluray::KeydbImport, sources: &[&str]) {
    let _ = bluray::record_sources(sources);
    result.status.sources = sources.iter().map(|value| (*value).to_string()).collect();
    result.status.updated_at = Some(chrono::Utc::now().to_rfc3339());
}

/// The download endpoint returns a ZIP containing `keydb.cfg`. Japanese is
/// the primary file and English fills any discs missing from it. This fixed
/// source is used only on explicit user action; the downloaded key data is
/// never returned to the frontend or written to a log.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeydbProgress {
    phase: String,
    message: String,
    percent: Option<u8>,
    received: u64,
    total: Option<u64>,
}
type Progress = Arc<dyn Fn(KeydbProgress) + Send + Sync>;

fn report(
    progress: &Progress,
    phase: &str,
    message: impl Into<String>,
    percent: Option<u8>,
    received: u64,
    total: Option<u64>,
) {
    progress(KeydbProgress {
        phase: phase.into(),
        message: message.into(),
        percent,
        received,
        total,
    });
}

#[tauri::command]
pub async fn bluray_key_download(
    on_progress: Channel<KeydbProgress>,
) -> Result<bluray::KeydbImport, AppError> {
    let progress: Progress = Arc::new(move |value| {
        let _ = on_progress.send(value);
    });
    download_and_import(progress).await
}

async fn download_and_import(progress: Progress) -> Result<bluray::KeydbImport, AppError> {
    report(&progress, "connect", "正在连接 FindVUK…", Some(0), 0, None);
    let japanese = fetch_keydb("jpn", "日语", 2, 120, &progress, 0, 48).await?;
    let english = fetch_keydb("eng", "英语", 1, 60, &progress, 48, 92)
        .await
        .ok();
    let supplemented = english.is_some();
    if !supplemented {
        report(
            &progress,
            "download",
            "英语源暂不可用，保留日语 KEYDB.cfg",
            Some(92),
            0,
            None,
        );
    }
    report(
        &progress,
        "merge",
        "正在合并日语和英语条目…",
        Some(94),
        0,
        None,
    );
    let merged = tauri::async_runtime::spawn_blocking(move || match english {
        Some(english) => bluray::merge_keydb(&japanese, &english),
        None => Ok(japanese),
    })
    .await
    .map_err(|_| AppError::new("settings", "KEYDB.cfg 合并未完成。"))??;
    report(
        &progress,
        "write",
        "正在校验并写入 KEYDB.cfg…",
        Some(98),
        0,
        None,
    );
    let mut result = tauri::async_runtime::spawn_blocking(move || bluray::import(&merged))
        .await
        .map_err(|_| AppError::new("settings", "KEYDB.cfg 导入未完成。"))??;
    result.english_supplemented = supplemented;
    if supplemented {
        mark_sources(&mut result, &["japanese", "english"]);
    } else {
        mark_sources(&mut result, &["japanese"]);
    }
    report(&progress, "done", "KEYDB.cfg 已就绪", Some(100), 0, None);
    Ok(result)
}

async fn fetch_keydb(
    language: &str,
    label: &str,
    attempts: u8,
    timeout_seconds: u64,
    progress: &Progress,
    start_percent: u8,
    end_percent: u8,
) -> Result<Vec<u8>, AppError> {
    let mut last = None;
    for attempt in 1..=attempts {
        match fetch_keydb_once(
            language,
            label,
            timeout_seconds,
            progress,
            start_percent,
            end_percent,
        )
        .await
        {
            Ok(value) => return Ok(value),
            Err(error) => {
                last = Some(error);
                if attempt < attempts {
                    report(
                        progress,
                        "download",
                        format!("正在重试下载{label} KEYDB.cfg…"),
                        Some(start_percent),
                        0,
                        None,
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }
    Err(last.unwrap_or_else(|| AppError::new("settings", "FindVUK 下载失败。")))
}

async fn fetch_keydb_once(
    language: &str,
    label: &str,
    timeout_seconds: u64,
    progress: &Progress,
    start_percent: u8,
    end_percent: u8,
) -> Result<Vec<u8>, AppError> {
    report(
        progress,
        "download",
        format!("正在连接 FindVUK {label}数据库…"),
        Some(start_percent),
        0,
        None,
    );
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .http1_only()
        .user_agent("DiscAtelier")
        .build()
        .map_err(|_| AppError::new("settings", "无法创建 KEYDB.cfg 下载客户端。"))?
        .get(format!("{KEYDB_DOWNLOAD_BASE}{language}"))
        .send()
        .await
        .map_err(|error| {
            AppError::new(
                "settings",
                format!("无法连接 FindVUK {label}数据库：{error}"),
            )
        })?;
    if !response.status().is_success() {
        return Err(AppError::new(
            "settings",
            format!("FindVUK {label}数据库暂时不可用。"),
        ));
    }
    let total = response.content_length();
    if total.is_some_and(|size| size > MAX_ARCHIVE_BYTES as u64) {
        return Err(AppError::new("settings", "FindVUK 下载文件超过大小限制。"));
    }
    let mut archive = Vec::with_capacity(total.unwrap_or(0).min(MAX_ARCHIVE_BYTES as u64) as usize);
    let mut last = Instant::now();
    report(
        progress,
        "download",
        format!("正在下载{label} KEYDB.cfg…"),
        range_percent(0, total, start_percent, end_percent),
        0,
        total,
    );
    let mut response = response;
    loop {
        let chunk = response.chunk().await.map_err(|error| {
            AppError::new("settings", format!("FindVUK {label}下载未完成：{error}"))
        })?;
        let Some(chunk) = chunk else {
            break;
        };
        if archive.len() + chunk.len() > MAX_ARCHIVE_BYTES {
            return Err(AppError::new("settings", "FindVUK 下载文件超过大小限制。"));
        }
        archive.extend_from_slice(&chunk);
        if last.elapsed() >= Duration::from_millis(150) {
            report(
                progress,
                "download",
                format!("正在下载{label} KEYDB.cfg…"),
                range_percent(archive.len() as u64, total, start_percent, end_percent),
                archive.len() as u64,
                total,
            );
            last = Instant::now();
        }
    }
    report(
        progress,
        "download",
        format!("{label} KEYDB.cfg 下载完成"),
        Some(end_percent),
        archive.len() as u64,
        Some(archive.len() as u64),
    );
    extract_keydb_zip(&archive)
}

fn range_percent(received: u64, total: Option<u64>, start: u8, end: u8) -> Option<u8> {
    let total = total?;
    if total == 0 {
        return Some(start);
    }
    let width = u64::from(end.saturating_sub(start));
    Some((u64::from(start) + received.min(total) * width / total).min(u64::from(end)) as u8)
}

fn extract_keydb_zip(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| AppError::new("settings", "FindVUK 下载内容不是有效的 ZIP。"))?;
    let mut name = None;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|_| AppError::new("settings", "无法读取 FindVUK 下载内容。"))?;
        if entry
            .name()
            .rsplit('/')
            .next()
            .is_some_and(|value| value.eq_ignore_ascii_case("keydb.cfg"))
        {
            name = Some(entry.name().to_string());
            break;
        }
    }
    let name = name.ok_or_else(|| AppError::new("settings", "下载内容中没有 keydb.cfg。"))?;
    let entry = archive
        .by_name(&name)
        .map_err(|_| AppError::new("settings", "无法读取 FindVUK 的 keydb.cfg。"))?;
    if entry.size() > bluray::MAX_KEYDB_BYTES as u64 {
        return Err(AppError::new("settings", "KEYDB.cfg 超过大小限制。"));
    }
    let mut data = Vec::with_capacity(entry.size() as usize);
    entry
        .take(bluray::MAX_KEYDB_BYTES as u64 + 1)
        .read_to_end(&mut data)
        .map_err(|_| AppError::new("settings", "KEYDB.cfg 解压失败。"))?;
    if data.len() > bluray::MAX_KEYDB_BYTES {
        return Err(AppError::new("settings", "KEYDB.cfg 超过大小限制。"));
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const VALID: &[u8] = b"0x0123456789ABCDEF0123456789ABCDEF01234567 = 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF\n";

    #[test]
    fn extracts_keydb_from_findvuk_zip() {
        let mut output = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut output);
            writer
                .start_file("keydb.cfg", zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(VALID).unwrap();
            writer.finish().unwrap();
        }
        assert_eq!(extract_keydb_zip(output.get_ref()).unwrap(), VALID);
    }

    #[test]
    #[ignore = "explicit network test; downloads FindVUK into a temporary APPDATA"]
    fn downloads_findvuk_keydb_into_temporary_appdata() {
        let root =
            std::env::temp_dir().join(format!("discatelier-findvuk-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let old = std::env::var_os("APPDATA");
        std::env::set_var("APPDATA", &root);
        let result = tauri::async_runtime::block_on(download_and_import(Arc::new(|_| {})));
        if let Some(value) = old {
            std::env::set_var("APPDATA", value);
        } else {
            std::env::remove_var("APPDATA");
        }
        let imported = result.unwrap();
        assert!(imported.status.configured);
        assert!(imported.status.bytes > 50 * 1024 * 1024);
        assert!(imported.status.entries > 1000);
        let target = root.join("aacs").join("KEYDB.cfg");
        assert!(target.is_file());
        for path in [target, root.join("aacs").join("KEYDB.cfg.discatelier.bak")] {
            let _ = std::fs::remove_file(path);
        }
        let _ = std::fs::remove_dir(root.join("aacs"));
        let _ = std::fs::remove_dir(root);
    }

    #[test]
    fn download_progress_maps_each_language_into_its_range() {
        assert_eq!(range_percent(0, Some(100), 0, 48), Some(0));
        assert_eq!(range_percent(50, Some(100), 0, 48), Some(24));
        assert_eq!(range_percent(50, Some(100), 48, 92), Some(70));
        assert_eq!(range_percent(1, None, 48, 92), None);
    }

    #[test]
    fn rejects_zip_without_keydb() {
        let mut output = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut output);
            writer
                .start_file("readme.txt", zip::write::SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"nothing").unwrap();
            writer.finish().unwrap();
        }
        assert!(extract_keydb_zip(output.get_ref()).is_err());
    }
}
