use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};

pub const CURRENCIES: [&str; 3] = ["CNY", "HKD", "JPY"];
pub fn error(message: impl Into<String>) -> AppError {
    AppError::new("exchange", message)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub enabled: bool,
    pub developer_id: String,
    pub target: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            enabled: false,
            developer_id: String::new(),
            target: "CNY".into(),
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), AppError> {
        if !CURRENCIES.contains(&self.target.as_str())
            || self.developer_id.len() > 32
            || !self.developer_id.bytes().all(|b| b.is_ascii_digit())
            || self.enabled && self.developer_id.is_empty()
        {
            return Err(error("请填写数字开发者 ID，并选择有效的显示币种。"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Quote {
    pub from: String,
    pub to: String,
    /// Decimal rate text; UI uses integer arithmetic for conversion.
    pub rate: String,
    pub updated_at: String,
    pub fetched_date: String,
}
impl Quote {
    pub fn validate(&self) -> Result<(), AppError> {
        let number: serde_json::Number =
            serde_json::from_str(&self.rate).map_err(|_| error("汇率缓存无效。"))?;
        let rate = number.as_f64().ok_or_else(|| error("汇率缓存无效。"))?;
        if !CURRENCIES.contains(&self.from.as_str())
            || !CURRENCIES.contains(&self.to.as_str())
            || self.from == self.to
            || self.rate.len() > 40
            || self.rate.trim() != self.rate
            || !rate.is_finite()
            || rate <= 0.0
            || !(1e-12..=1e12).contains(&rate)
            || chrono::NaiveDateTime::parse_from_str(&self.updated_at, "%Y-%m-%d %H:%M:%S").is_err()
            || chrono::NaiveDate::parse_from_str(&self.fetched_date, "%Y-%m-%d").is_err()
        {
            return Err(error("汇率缓存无效。"));
        }
        Ok(())
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Cache {
    pub target: String,
    pub attempt_date: String,
    pub last_attempt_at: i64,
    pub rates: Vec<Quote>,
    pub last_error: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Document {
    pub settings: Settings,
    pub cache: Cache,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub settings: Settings,
    pub has_key: bool,
    pub rates: Vec<Quote>,
    pub today: String,
    pub attempt_date: String,
    pub last_attempt_at: i64,
    pub error: String,
}

pub fn status(document: Document, has_key: bool, today: String) -> Status {
    let rates = if document.cache.target == document.settings.target {
        document.cache.rates
    } else {
        vec![]
    };
    Status {
        settings: document.settings,
        has_key,
        rates,
        today,
        attempt_date: document.cache.attempt_date,
        last_attempt_at: document.cache.last_attempt_at,
        error: document.cache.last_error,
    }
}

pub fn due(document: &Document, today: &str, now: i64, force: bool) -> bool {
    document.settings.enabled
        && (document.cache.last_attempt_at == 0
            || now.saturating_sub(document.cache.last_attempt_at) >= 60)
        && (force || document.cache.attempt_date.as_str() < today)
}
