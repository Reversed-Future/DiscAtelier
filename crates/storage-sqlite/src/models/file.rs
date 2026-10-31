use super::validation;
use crate::profiling;
use discatelier_contracts::{AppError, PreparedModel};
use sha2::{Digest, Sha256};
use std::{ffi::OsStr, fs::File, io::Read, path::Path};

pub fn prepare(path: &Path) -> Result<PreparedModel, AppError> {
    let _total = profiling::Span::new("model.prepare_total");
    if path.is_absolute() {
        if let Some(format @ ("glb" | "obj" | "fbx" | "skp")) =
            path.extension().and_then(|s| s.to_str())
        {
            return super::source::prepare(path, format);
        }
    }
    if !path.is_absolute() || path.extension() != Some(OsStr::new("ateliermodel")) {
        return Err(AppError::new(
            "model",
            "请选择 .ateliermodel、.glb、.obj、.fbx 或 .skp 文件。",
        ));
    }
    let text = profiling::measure("model.file_read", || -> Result<String, AppError> {
        let file = File::open(path).map_err(|_| AppError::new("model", "无法读取模型文件。"))?;
        let metadata = file
            .metadata()
            .map_err(|_| AppError::new("model", "无法读取模型文件信息。"))?;
        if !metadata.is_file() || metadata.len() > 50 * 1024 * 1024 {
            return Err(AppError::new("model", "模型文件不能超过 50 MiB。"));
        }
        // Also bound the actual read: the file may grow after metadata was read.
        let mut text = String::new();
        file.take(50 * 1024 * 1024 + 1)
            .read_to_string(&mut text)
            .map_err(|_| AppError::new("model", "模型必须是可读取的 UTF-8 文件。"))?;
        if text.len() > 50 * 1024 * 1024 {
            return Err(AppError::new("model", "模型文件不能超过 50 MiB。"));
        }
        Ok(text)
    })?;
    let metadata = profiling::measure("model.validate_total", || validation::validate(&text))?;
    let id = profiling::measure("model.sha256", || {
        format!("{:x}", Sha256::digest(text.as_bytes()))
    });
    Ok(PreparedModel {
        id,
        title: metadata.title,
        text: text.into(),
        preview: metadata.preview.into(),
    })
}
