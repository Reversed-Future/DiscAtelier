use discatelier_contracts::AppError;
use discatelier_integration_http::{error, request};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Fields verified against api-enhanced 4.41.1 /lyric.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub original: String,
    pub translation: String,
    pub romanization: String,
}
pub fn parse(value: Value) -> Result<Lyrics, AppError> {
    super::checked(value.clone())?;
    fn text(value: &Value, key: &str) -> Result<String, AppError> {
        match value.get(key).and_then(|v| v.get("lyric")) {
            None | Some(Value::Null) => Ok(String::new()),
            Some(Value::String(text)) if text.len() <= 512 * 1024 => Ok(text.clone()),
            _ => Err(error("网易云歌词格式无效。")),
        }
    }
    Ok(Lyrics {
        original: text(&value, "lrc")?,
        translation: text(&value, "tlyric")?,
        romanization: text(&value, "romalrc")?,
    })
}
pub fn fetch(base: &str, id: u64) -> Result<Lyrics, AppError> {
    parse(request(
        base,
        "lyric",
        &[("id", id.to_string())],
        None,
        None,
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_verified_fields_and_distinguishes_empty_from_failure() {
        let value = parse(serde_json::json!({"code":200,"lrc":{"lyric":"[00:01.00]Original"},"tlyric":{"lyric":"[00:01.00]Translation"},"romalrc":{"lyric":""}})).unwrap();
        assert_eq!(value.original, "[00:01.00]Original");
        assert!(!value.translation.is_empty());
        assert!(parse(serde_json::json!({"code":200}))
            .unwrap()
            .original
            .is_empty());
        assert!(parse(serde_json::json!({"code":500})).is_err());
        assert!(parse(serde_json::json!({"code":200,"lrc":{"lyric":42}})).is_err());
    }
}
