//! Metadata-only backup management. Callers serialize this with backup/restore/update writes.
use discatelier_contracts::{AppError, BackupInventory, ManagedBackup};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

fn error() -> AppError {
    AppError::new("backup", "无法访问备份文件，请刷新列表后重试。")
}

fn root(directory: &Path) -> Result<Option<PathBuf>, AppError> {
    let path = directory.join("backups");
    let metadata = match fs::symlink_metadata(&path) {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(error()),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(error());
    }
    let canonical = fs::canonicalize(&path).map_err(|_| error())?;
    if canonical.parent() != Some(fs::canonicalize(directory).map_err(|_| error())?.as_path()) {
        return Err(error());
    }
    Ok(Some(canonical))
}

fn managed(name: &str) -> bool {
    matches!(
        Path::new(name).extension().and_then(|v| v.to_str()),
        Some("sqlite3" | "partial")
    )
}

fn entry(path: &Path, name: String) -> Result<ManagedBackup, AppError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| error())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(error());
    }
    let modified = metadata.modified().map_err(|_| error())?;
    let fingerprint = format!(
        "{}:{:?}:{:?}",
        metadata.len(),
        modified,
        metadata.created().ok()
    );
    Ok(ManagedBackup {
        incomplete: Path::new(&name).extension().is_some_and(|e| e == "partial"),
        name,
        byte_length: metadata.len(),
        modified_at: chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339(),
        stamp: format!("{:x}", Sha256::digest(fingerprint.as_bytes())),
    })
}

pub fn inventory(directory: &Path) -> Result<BackupInventory, AppError> {
    let mut result = BackupInventory {
        entries: vec![],
        total_bytes: 0,
        other_bytes: 0,
    };
    let Some(root) = root(directory)? else {
        return Ok(result);
    };
    for file in fs::read_dir(root).map_err(|_| error())? {
        let file = file.map_err(|_| error())?;
        let kind = file.file_type().map_err(|_| error())?;
        // Backups are flat files; never follow links or traverse directories.
        if !kind.is_file() || kind.is_symlink() {
            continue;
        }
        let metadata = file.metadata().map_err(|_| error())?;
        result.total_bytes += metadata.len();
        let name = file.file_name().into_string().map_err(|_| error())?;
        if managed(&name) {
            result.entries.push(entry(&file.path(), name)?);
        } else {
            result.other_bytes += metadata.len();
        }
    }
    result
        .entries
        .sort_by(|a, b| b.modified_at.cmp(&a.modified_at).then(a.name.cmp(&b.name)));
    Ok(result)
}

/// Delete exactly one explicitly selected file, with a fresh metadata comparison.
pub fn delete_one(directory: &Path, name: &str, stamp: &str) -> Result<(), AppError> {
    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(_)))
        || components.next().is_some()
        || name.contains(['/', '\\', ':'])
        || name.ends_with([' ', '.'])
        || !managed(name)
    {
        return Err(error());
    }
    let root = root(directory)?.ok_or_else(error)?;
    let path = root.join(name);
    let current = entry(&path, name.to_owned())?;
    if current.stamp != stamp {
        return Err(AppError::new(
            "backup_changed",
            "备份已发生变化，请刷新后重新选择。",
        ));
    }
    if fs::canonicalize(&path).map_err(|_| error())?.parent() != Some(root.as_path()) {
        return Err(error());
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        if root
            .join(format!("{name}{suffix}"))
            .try_exists()
            .map_err(|_| error())?
        {
            return Err(AppError::new(
                "backup_busy",
                "这份备份正在使用中，请稍后重试。",
            ));
        }
    }
    fs::remove_file(&path)
        .map_err(|_| AppError::new("backup_delete", "未能删除这份备份，文件可能正在使用中。"))
}
