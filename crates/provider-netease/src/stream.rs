use discatelier_contracts::AppError;
use discatelier_integration_http::{error, request};
use serde::Deserialize;
use serde_json::Value;

pub struct SongStream {
    pub url: String,
    pub preview: bool,
}
#[derive(Deserialize)]
struct Response {
    data: Vec<Entry>,
}
#[derive(Deserialize)]
struct Entry {
    id: u64,
    url: Option<String>,
    #[serde(rename = "freeTrialInfo", default)]
    preview: Option<Value>,
}
pub fn song_stream(base: &str, id: u64) -> Result<SongStream, AppError> {
    parse_song_stream(
        request(
            base,
            "song/url/v1",
            &[
                ("id", id.to_string()),
                ("level", "standard".into()),
                ("unblock", "false".into()),
            ],
            None,
            None,
        )?,
        id,
    )
}
pub fn parse_song_stream(value: Value, id: u64) -> Result<SongStream, AppError> {
    let response: Response = serde_json::from_value(super::checked(value)?)
        .map_err(|_| error("网易云播放响应格式不匹配。"))?;
    let mut entries = response.data.into_iter().filter(|s| s.id == id);
    let entry = entries
        .next()
        .ok_or_else(|| error("没有返回这首曲目的播放信息。"))?;
    if entries.next().is_some() {
        return Err(error("播放信息重复，请重试。"));
    }
    let url = entry
        .url
        .filter(|v| !v.is_empty())
        .ok_or_else(|| error("网易云未提供播放链接，此曲目当前不可播放。"))?;
    let mut parsed = url::Url::parse(&url).map_err(|_| error("播放链接无效。"))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed
            .host_str()
            .is_some_and(|s| s.ends_with(".music.126.net"))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
    {
        return Err(error("播放链接不属于已支持的网易云音频地址。"));
    }
    parsed
        .set_scheme("https")
        .map_err(|_| error("播放链接无效。"))?;
    Ok(SongStream {
        url: parsed.into(),
        preview: entry.preview.is_some(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_identity_unavailable_preview_and_urls() {
        let raw = serde_json::json!({"code":200,"data":[{"id":42,"url":"http://p3.music.126.net/test.mp3","freeTrialInfo":null}]});
        let stream = parse_song_stream(raw.clone(), 42).unwrap();
        assert!(!stream.preview);
        assert!(stream.url.starts_with("https://"));
        assert!(parse_song_stream(raw.clone(), 43).is_err());
        let mut preview = raw.clone();
        preview["data"][0]["freeTrialInfo"] = serde_json::json!({});
        assert!(parse_song_stream(preview, 42).unwrap().preview);
        for url in [
            Value::Null,
            Value::String("file:///F:/video.mp3".into()),
            Value::String("https://127.0.0.1/test.mp3".into()),
        ] {
            let mut v = raw.clone();
            v["data"][0]["url"] = url;
            assert!(parse_song_stream(v, 42).is_err());
        }
    }
}
