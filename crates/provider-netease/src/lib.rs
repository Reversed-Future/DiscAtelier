//! api-enhanced /search (type=10) and /album. Schema verified with 4.41.1 responses.
use discatelier_contracts::{validate_supplement, AppError, MusicSupplement, SupplementTrack};
use discatelier_integration_http::{error, request};
use serde::{Deserialize, Serialize};
use serde_json::Value;
mod stream;
pub use stream::{parse_song_stream, song_stream, SongStream};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumResult {
    pub id: u64,
    pub title: String,
    pub artists: Vec<String>,
    pub cover_url: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumSearchPage {
    pub items: Vec<AlbumResult>,
    pub total: u32,
    pub offset: u32,
    pub limit: u32,
}
pub const SEARCH_LIMIT: u32 = 20;
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
    #[serde(rename = "picUrl", default)]
    cover_url: Option<String>,
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
    #[serde(rename = "albumCount")]
    album_count: u32,
}

fn checked(value: Value) -> Result<Value, AppError> {
    if value.get("code").and_then(Value::as_i64) != Some(200) {
        return Err(error("网易云未返回成功结果，请检查服务。"));
    }
    Ok(value)
}
pub fn search(base: &str, query: &str) -> Result<Vec<AlbumResult>, AppError> {
    Ok(search_page(base, query, 0)?.items)
}
pub fn search_page(base: &str, query: &str, offset: u32) -> Result<AlbumSearchPage, AppError> {
    if query.trim().is_empty() || query.len() > 500 {
        return Err(error("请输入专辑或歌手，最多 500 字节。"));
    }
    parse_search_page(
        request(
            base,
            "search",
            &[
                ("keywords", query.into()),
                ("type", "10".into()),
                ("limit", SEARCH_LIMIT.to_string()),
                ("offset", offset.to_string()),
            ],
            None,
            None,
        )?,
        offset,
    )
}
pub fn parse_search(value: Value) -> Result<Vec<AlbumResult>, AppError> {
    Ok(parse_search_page(value, 0)?.items)
}
pub fn parse_search_page(value: Value, offset: u32) -> Result<AlbumSearchPage, AppError> {
    let response: SearchResponse =
        serde_json::from_value(checked(value)?).map_err(|_| error("网易云搜索响应格式不匹配。"))?;
    let items = response
        .result
        .albums
        .into_iter()
        .map(|a| AlbumResult {
            id: a.id,
            title: a.name,
            artists: a.artists.into_iter().map(|v| v.name).collect(),
            cover_url: cover_url(a.cover_url.as_deref()),
        })
        .collect();
    Ok(AlbumSearchPage {
        items,
        total: response.result.album_count,
        offset,
        limit: SEARCH_LIMIT,
    })
}
fn cover_url(value: Option<&str>) -> Option<String> {
    let mut url = url::Url::parse(value?).ok()?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.host_str()?.ends_with(".music.126.net")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return None;
    }
    url.set_scheme("https").ok()?;
    Some(url.into())
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
        links: Vec::new(),
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
    fn search_preserves_page_total_and_maps_cover() {
        let raw = serde_json::json!({"code":200,"result":{"albumCount":513,"albums":[
            {"id":42,"name":"Album","artists":[{"name":"Artist"}],"publishTime":1,"picUrl":"http://p4.music.126.net/cover.jpg"},
            {"id":43,"name":"Without cover","artists":[],"publishTime":1}
        ]}});
        let page = parse_search_page(raw, 20).unwrap();
        assert_eq!(page.total, 513);
        assert_eq!(page.offset, 20);
        assert_eq!(page.limit, 20);
        assert_eq!(page.items.len(), 2);
        assert_eq!(
            page.items[0].cover_url.as_deref(),
            Some("https://p4.music.126.net/cover.jpg")
        );
        assert!(page.items[1].cover_url.is_none());
        let empty = parse_search_page(serde_json::json!({"code":200,"result":{"albumCount":0}}), 0)
            .unwrap();
        assert!(empty.items.is_empty());
        assert_eq!(empty.total, 0);
    }
    #[test]
    fn cover_rejects_foreign_hosts_credentials_and_local_schemes() {
        for value in [
            "https://p4.music.126.net.evil.example/a.jpg",
            "file:///a.jpg",
            "http://127.0.0.1/a.jpg",
            "https://user:secret@p4.music.126.net/a.jpg",
            "https://p4.music.126.net:8080/a.jpg",
        ] {
            assert!(cover_url(Some(value)).is_none());
        }
    }
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
