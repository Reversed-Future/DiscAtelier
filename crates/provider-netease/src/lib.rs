//! api-enhanced /search (type=10) and /album. Schema verified with 4.41.1 responses.
use discatelier_contracts::{validate_supplement, AppError, MusicSupplement, SupplementTrack};
use discatelier_integration_http::{error, request};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumResult {
    pub id: u64,
    pub title: String,
    pub artists: Vec<String>,
}
#[derive(Deserialize)]
struct Artist {
    name: String,
}
#[derive(Deserialize)]
struct Album {
    id: u64,
    name: String,
    artists: Vec<Artist>,
    #[serde(default)]
    description: String,
    #[serde(default)]
    company: Option<String>,
    #[serde(rename = "publishTime")]
    published_at: i64,
}
#[derive(Deserialize)]
struct Song {
    id: u64,
    name: String,
    ar: Vec<Artist>,
    cd: String,
    no: u32,
    dt: u64,
}
#[derive(Deserialize)]
struct AlbumResponse {
    album: Album,
    songs: Vec<Song>,
}
#[derive(Deserialize)]
struct SearchResponse {
    result: SearchResult,
}
#[derive(Deserialize)]
struct SearchResult {
    #[serde(default)]
    albums: Vec<Album>,
}

fn checked(value: Value) -> Result<Value, AppError> {
    if value.get("code").and_then(Value::as_i64) != Some(200) {
        return Err(error("网易云未返回成功结果，请检查服务。"));
    }
    Ok(value)
}
pub fn search(base: &str, query: &str) -> Result<Vec<AlbumResult>, AppError> {
    if query.trim().is_empty() || query.len() > 500 {
        return Err(error("请输入专辑或歌手，最多 500 字节。"));
    }
    parse_search(request(
        base,
        "search",
        &[
            ("keywords", query.into()),
            ("type", "10".into()),
            ("limit", "20".into()),
            ("offset", "0".into()),
        ],
        None,
        None,
    )?)
}
pub fn parse_search(value: Value) -> Result<Vec<AlbumResult>, AppError> {
    let response: SearchResponse =
        serde_json::from_value(checked(value)?).map_err(|_| error("网易云搜索响应格式不匹配。"))?;
    Ok(response
        .result
        .albums
        .into_iter()
        .take(20)
        .map(|a| AlbumResult {
            id: a.id,
            title: a.name,
            artists: a.artists.into_iter().map(|v| v.name).collect(),
        })
        .collect())
}
pub fn album(base: &str, id: u64) -> Result<MusicSupplement, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(error("专辑 ID 无效。"));
    }
    parse_album(
        request(base, "album", &[("id", id.to_string())], None, None)?,
        id,
    )
}
pub fn parse_album(value: Value, id: u64) -> Result<MusicSupplement, AppError> {
    let r: AlbumResponse =
        serde_json::from_value(checked(value)?).map_err(|_| error("网易云专辑响应格式不匹配。"))?;
    if r.album.id != id {
        return Err(error("服务返回了不同的专辑。"));
    }
    let value = MusicSupplement {
        album_id: id,
        title: r.album.name,
        artists: r.album.artists.into_iter().map(|v| v.name).collect(),
        description: r.album.description,
        company: r.album.company.unwrap_or_default(),
        published_at: r.album.published_at,
        tracks: r
            .songs
            .into_iter()
            .map(|s| SupplementTrack {
                id: s.id,
                title: s.name,
                artists: s.ar.into_iter().map(|a| a.name).collect(),
                disc: s.cd,
                number: s.no,
                duration_ms: s.dt,
            })
            .collect(),
    };
    validate_supplement(&value)?;
    Ok(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mapping_preserves_disc_numbers_and_refuses_wrong_album() {
        let raw = serde_json::json!({"code":200,"album":{"id":42,"name":"Album","artists":[{"name":"Artist"}],"description":"Info","company":null,"publishTime":1},"songs":[{"id":99,"name":"Track","ar":[{"name":"Artist"}],"cd":"2","no":3,"dt":123456}]});
        let value = parse_album(raw.clone(), 42).unwrap();
        assert_eq!(value.tracks[0].disc, "2");
        assert_eq!(value.tracks[0].number, 3);
        assert!(parse_album(raw, 43).is_err());
        assert!(parse_search(serde_json::json!({"code":301})).is_err());
    }
}
