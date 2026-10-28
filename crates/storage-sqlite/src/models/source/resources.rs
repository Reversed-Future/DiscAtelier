use super::{invalid, RAW_LIMIT};
use discatelier_contracts::AppError;
use std::{fs::File, io::Read, path::Path};

// Separators follow the source formats' path syntax; no case folding or basename search.
pub(super) fn relative(name: &str) -> Result<String, AppError> {
    let name = name.replace('\\', "/");
    if name.is_empty()
        || name.len() > 1024
        || name.starts_with('/')
        || name.contains([':', '\0', '?', '#'])
    {
        return Err(invalid(format!("资源必须使用模型目录内的相对路径：{name}")));
    }
    let mut parts = Vec::new();
    for part in name.split('/') {
        match part {
            "" | "." => {}
            ".." => return Err(invalid(format!("资源不能引用模型目录以外的位置：{name}"))),
            _ => parts.push(part),
        }
    }
    if parts.is_empty() {
        return Err(invalid("资源路径为空。"));
    }
    Ok(parts.join("/"))
}
pub(super) fn read(root: &Path, name: &str, total: &mut usize) -> Result<Vec<u8>, AppError> {
    let relative = relative(name)?;
    let path = root.join(relative).canonicalize().map_err(|_| {
        invalid(format!(
            "缺少关联资源：{name}。请按文件中记录的相对路径放置。"
        ))
    })?;
    if !path.starts_with(root) {
        return Err(invalid("模型资源不能通过链接指向目录外。"));
    }
    let file = File::open(path).map_err(|_| invalid(format!("无法读取资源：{name}")))?;
    if !file
        .metadata()
        .map_err(|_| invalid("无法读取资源属性。"))?
        .is_file()
    {
        return Err(invalid("模型资源必须是文件。"));
    }
    let mut data = Vec::new();
    file.take((RAW_LIMIT.saturating_sub(*total) + 1) as u64)
        .read_to_end(&mut data)
        .map_err(|_| invalid("读取模型资源失败。"))?;
    *total += data.len();
    if *total > RAW_LIMIT {
        return Err(invalid("模型及关联资源合计不能超过 50 MiB。"));
    }
    Ok(data)
}
