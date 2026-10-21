use discatelier_contracts::AppError;
use discatelier_domain::{validate_copy, CopyDraft};
use discatelier_integration_http::error;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Recognition {
    pub records: Vec<Record>,
    pub message: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    pub title: String,
    pub source_images: Vec<usize>,
    pub fields: Vec<Field>,
    pub warning: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Field {
    pub key: Key,
    pub value: String,
    pub currency: Option<String>,
    pub evidence: String,
}
#[derive(Deserialize, Serialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Key {
    Price,
    AcquiredAt,
    Seller,
    PurchaseUrl,
    Status,
}

fn bounded(value: &str, max: usize) -> bool {
    value.chars().count() <= max && !value.contains('\0')
}
fn amount(value: &str, currency: &str) -> Option<i64> {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    let digits = if currency == "JPY" { 0 } else { 2 };
    if whole.is_empty()
        || !whole.bytes().all(|c| c.is_ascii_digit())
        || !fraction.bytes().all(|c| c.is_ascii_digit())
        || fraction.len() > digits
        || (value.contains('.') && (fraction.is_empty() || digits == 0))
    {
        return None;
    }
    let scale = if digits == 0 { 1 } else { 100 };
    whole
        .parse::<i64>()
        .ok()?
        .checked_mul(scale)?
        .checked_add(if fraction.is_empty() {
            0
        } else {
            fraction.parse::<i64>().ok()? * if fraction.len() == 1 { 10 } else { 1 }
        })
}
pub fn parse(response: &Value, images: usize) -> Result<Recognition, AppError> {
    let invalid = || error("AI 返回的识别格式或字段无效，未填写表单；请重试或手动填写。");
    if response
        .pointer("/choices/0/finish_reason")
        .and_then(Value::as_str)
        != Some("stop")
    {
        return Err(invalid());
    }
    let text = response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(invalid)?;
    if text.len() > 65536 {
        return Err(invalid());
    }
    let result: Recognition = serde_json::from_str(text).map_err(|_| invalid())?;
    if result.records.len() > 12 || !bounded(&result.message, 1000) {
        return Err(invalid());
    }
    for record in &result.records {
        if record.title.trim().is_empty()
            || !bounded(&record.title, 300)
            || !bounded(&record.warning, 1000)
            || record.source_images.is_empty()
            || record.source_images.len() > images
            || record.source_images.iter().any(|i| *i == 0 || *i > images)
            || record.fields.len() > 5
        {
            return Err(invalid());
        }
        let mut copy = CopyDraft {
            status: "owned".into(),
            acquired_at: String::new(),
            amount_minor: None,
            currency: "CNY".into(),
            seller: String::new(),
            purchase_url: String::new(),
            storage_location: String::new(),
            notes: String::new(),
        };
        let mut seen = Vec::new();
        for field in &record.fields {
            if seen.contains(&field.key)
                || field.value.trim().is_empty()
                || field.evidence.trim().is_empty()
                || !bounded(&field.evidence, 300)
                || (field.key != Key::Price && field.currency.is_some())
            {
                return Err(invalid());
            }
            seen.push(field.key);
            match field.key {
                Key::Price => {
                    copy.currency = field.currency.clone().ok_or_else(invalid)?;
                    copy.amount_minor =
                        Some(amount(&field.value, &copy.currency).ok_or_else(invalid)?);
                }
                Key::AcquiredAt => copy.acquired_at = field.value.clone(),
                Key::Seller => copy.seller = field.value.clone(),
                Key::PurchaseUrl => copy.purchase_url = field.value.clone(),
                Key::Status => {
                    if !["owned", "transit"].contains(&field.value.as_str()) {
                        return Err(invalid());
                    }
                    copy.status = field.value.clone();
                }
            }
        }
        validate_copy(&copy).map_err(|_| invalid())?;
    }
    Ok(result)
}
