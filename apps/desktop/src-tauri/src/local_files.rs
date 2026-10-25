use crate::data_location::DataLocation;
use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const MAX_FILES: usize = 20_000;

fn error(message: impl Into<String>) -> AppError {
    AppError::new("local-files", message)
}
const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "m4v", "ts", "m2ts", "webm", "wmv", "flv", "mpg", "mpeg", "mp3",
    "flac", "wav", "m4a", "aac", "ogg", "opus", "ape", "wv",
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub copy_id: String,
    pub path: String,
    pub label: String,
    #[serde(default)]
    pub episode: Option<i32>,
    #[serde(default)]
    pub track: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub path: String,
    pub relative_path: String,
    pub name: String,
    pub size: u64,
}

fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    value.strip_prefix(r"\\?\").unwrap_or(&value).to_owned()
}

fn store(directory: &Path) -> PathBuf {
    directory.join("local-files.json")
}

fn read(directory: &Path) -> Result<Vec<Binding>, AppError> {
    let path = store(directory);
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(&path).map_err(|_| error("无法读取本地文件关联。"))?;
    let bindings: Vec<Binding> = serde_json::from_slice(&bytes)
        .map_err(|_| error("本地文件关联文件已损坏；请重新选择文件夹扫描。"))?;
    if bindings.len() > MAX_FILES {
        return Err(error("本地文件关联数量超过限制。"));
    }
    Ok(bindings)
}

fn validate_binding(binding: &Binding) -> Result<(), AppError> {
    if binding.copy_id.trim().is_empty()
        || binding.copy_id.len() > 100
        || binding.path.len() > 4096
        || binding.label.chars().count() > 500
        || binding
            .episode
            .is_some_and(|value| !(1..=9999).contains(&value))
        || binding
            .track
            .is_some_and(|value| !(1..=9999).contains(&value))
    {
        return Err(error("本地文件关联字段无效。"));
    }
    let path = Path::new(&binding.path);
    if !path.is_absolute() || !path.is_file() {
        return Err(error("本地文件不存在或不是绝对路径。"));
    }
    if !MEDIA_EXTENSIONS.contains(
        &path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
    ) {
        return Err(error("本地文件不是支持的音视频格式。"));
    }
    Ok(())
}

#[tauri::command]
pub fn local_files_scan(folder: String) -> Result<Vec<ScannedFile>, AppError> {
    let root = PathBuf::from(&folder);
    if !root.is_absolute() || !root.is_dir() {
        return Err(error("请选择有效的文件夹。"));
    }
    let root = root
        .canonicalize()
        .map_err(|_| error("无法访问所选文件夹。"))?;
    let mut pending = vec![root.clone()];
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        let entries = std::fs::read_dir(&directory)
            .map_err(|_| error(format!("无法读取目录：{}", directory.display())))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                pending.push(path);
                continue;
            }
            if !kind.is_file() || files.len() >= MAX_FILES {
                continue;
            }
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if !MEDIA_EXTENSIONS.contains(&extension.as_str()) {
                continue;
            }
            let Ok(relative) = path.strip_prefix(&root) else {
                continue;
            };
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            files.push(ScannedFile {
                path: display_path(&path),
                relative_path: relative.to_string_lossy().replace('\\', "/"),
                name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_owned(),
                size: metadata.len(),
            });
        }
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

#[tauri::command]
pub fn local_files_get(
    directory: tauri::State<'_, DataLocation>,
) -> Result<Vec<Binding>, AppError> {
    read(&directory.0)
}

#[tauri::command]
pub fn local_files_save(
    directory: tauri::State<'_, DataLocation>,
    bindings: Vec<Binding>,
) -> Result<(), AppError> {
    if bindings.len() > MAX_FILES {
        return Err(error("本地文件关联数量超过限制。"));
    }
    for binding in &bindings {
        validate_binding(binding)?;
    }
    let mut seen = std::collections::HashSet::new();
    for binding in &bindings {
        if !seen.insert((binding.copy_id.as_str(), binding.path.as_str())) {
            return Err(error("同一个收藏重复关联了同一个文件。"));
        }
    }
    let bytes =
        serde_json::to_vec_pretty(&bindings).map_err(|_| error("无法序列化本地文件关联。"))?;
    std::fs::write(store(&directory.0), bytes).map_err(|_| error("无法保存本地文件关联。"))
}

pub fn is_audio(path: &str) -> bool {
    matches!(
        Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "mp3" | "flac" | "wav" | "m4a" | "aac" | "ogg" | "opus" | "ape" | "wv"
    )
}

pub fn find(directory: &Path, copy_id: &str, path: &str) -> Result<Binding, AppError> {
    read(directory)?
        .into_iter()
        .find(|binding| binding.copy_id == copy_id && binding.path == path)
        .ok_or_else(|| error("该文件没有关联到这个收藏。"))
}
