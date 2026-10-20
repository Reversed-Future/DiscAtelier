use crate::{carriers, categories, CopyDraft, EditionDraft};

fn bounded(value: &str, max: usize, field: &str) -> Result<(), String> {
    if value.chars().count() > max || value.contains('\0') {
        return Err(format!("{field}过长或包含无效字符"));
    }
    Ok(())
}
pub fn validate_edition(value: &EditionDraft) -> Result<(), String> {
    if value.title.trim().is_empty() {
        return Err("请填写名称".into());
    }
    if !categories()
        .iter()
        .any(|entry| entry.id == value.category_id)
    {
        return Err("分区无效".into());
    }
    bounded(&value.title, 200, "名称")?;
    bounded(&value.creator, 200, "作者")?;
    bounded(&value.edition_label, 200, "版本")?;
    bounded(&value.barcode, 200, "条码")?;
    bounded(&value.catalog_number, 200, "品番")?;
    if value.media.is_empty() || value.media.len() > 99 {
        return Err("每套需要 1 至 99 张载体".into());
    }
    for medium in &value.media {
        if !carriers().iter().any(|entry| entry.id == medium.carrier_id) {
            return Err("载体无效".into());
        }
        bounded(&medium.label, 200, "盘片名称")?;
    }
    Ok(())
}
pub fn validate_copy(value: &CopyDraft) -> Result<(), String> {
    if !["owned", "wanted", "transit"].contains(&value.status.as_str()) {
        return Err("收藏状态无效".into());
    }
    if !["CNY", "HKD", "JPY"].contains(&value.currency.as_str()) {
        return Err("币种无效".into());
    }
    if let Some(amount) = value.amount_minor {
        if !(0..=9_000_000_000_000).contains(&amount) {
            return Err("价格超出范围".into());
        }
    }
    if !value.acquired_at.is_empty() {
        let date = chrono::NaiveDate::parse_from_str(&value.acquired_at, "%Y-%m-%d")
            .map_err(|_| "日期请使用 YYYY-MM-DD")?;
        if date.format("%Y-%m-%d").to_string() != value.acquired_at {
            return Err("日期请使用 YYYY-MM-DD".into());
        }
    }
    bounded(&value.seller, 200, "购入位置")?;
    bounded(&value.storage_location, 200, "存放位置")?;
    bounded(&value.notes, 4000, "备注")?;
    bounded(&value.purchase_url, 2048, "购买链接")?;
    if !value.purchase_url.is_empty() {
        let url = url::Url::parse(&value.purchase_url).map_err(|_| "购买链接无效")?;
        if !["https", "http"].contains(&url.scheme())
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("购买链接须为不含登录凭据的 HTTP 或 HTTPS 地址".into());
        }
    }
    Ok(())
}
