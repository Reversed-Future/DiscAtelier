use super::model::{error, Document};
use discatelier_contracts::AppError;
use std::{
    io::{Read, Write},
    path::Path,
};

pub fn read(directory: &Path) -> Result<Document, AppError> {
    let file = match std::fs::File::open(directory.join("exchange-rates.json")) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Document::default()),
        Err(_) => return Err(error("无法读取汇率设置。")),
    };
    let mut text = String::new();
    file.take(32769)
        .read_to_string(&mut text)
        .map_err(|_| error("无法读取汇率缓存。"))?;
    if text.len() > 32768 {
        return Err(error("汇率缓存超出限制。"));
    }
    let value: Document = serde_json::from_str(&text).map_err(|_| error("汇率缓存格式无效。"))?;
    value.settings.validate()?;
    if value.cache.rates.len() > 2
        || value.cache.last_error.len() > 1000
        || value.cache.last_attempt_at < 0
        || !value.cache.attempt_date.is_empty()
            && chrono::NaiveDate::parse_from_str(&value.cache.attempt_date, "%Y-%m-%d").is_err()
    {
        return Err(error("汇率缓存格式或范围无效。"));
    }
    for rate in &value.cache.rates {
        rate.validate()?;
        if rate.to != value.cache.target
            || value
                .cache
                .rates
                .iter()
                .filter(|r| r.from == rate.from)
                .count()
                != 1
        {
            return Err(error("汇率缓存的币种不一致。"));
        }
    }
    Ok(value)
}
pub fn write(directory: &Path, value: &Document) -> Result<(), AppError> {
    std::fs::create_dir_all(directory).map_err(|_| error("无法创建汇率缓存目录。"))?;
    let path = directory.join(format!("exchange-rates-{}.tmp", uuid::Uuid::new_v4()));
    let data = serde_json::to_vec(value).map_err(|_| error("无法保存汇率设置。"))?;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| error("无法写入汇率缓存。"))?;
    file.write_all(&data)
        .and_then(|_| file.sync_all())
        .map_err(|_| error("汇率缓存未能完整写入。"))?;
    drop(file);
    std::fs::rename(path, directory.join("exchange-rates.json"))
        .map_err(|_| error("无法替换汇率缓存。"))
}
