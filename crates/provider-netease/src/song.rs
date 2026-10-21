use discatelier_contracts::AppError;
use discatelier_integration_http::{error, request};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Detail {
    songs: Vec<Song>,
}
#[derive(Deserialize)]
struct Song {
    id: u64,
    al: Option<Album>,
}
#[derive(Deserialize)]
struct Album {
    id: u64,
}

pub fn song_album(base: &str, id: u64) -> Result<u64, AppError> {
    parse_song_album(
        request(base, "song/detail", &[("ids", id.to_string())], None, None)?,
        id,
    )
}
pub fn parse_song_album(value: Value, id: u64) -> Result<u64, AppError> {
    let detail: Detail = serde_json::from_value(super::checked(value)?)
        .map_err(|_| error("网易云歌曲详情格式不匹配。"))?;
    let mut songs = detail.songs.into_iter().filter(|song| song.id == id);
    let song = songs
        .next()
        .ok_or_else(|| error("没有返回链接中的歌曲。"))?;
    if songs.next().is_some() {
        return Err(error("歌曲信息重复，请重新读取。"));
    }
    song.al
        .map(|a| a.id)
        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
        .ok_or_else(|| error("这首歌曲没有可读取的专辑资料。"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn song_identity_and_album_are_required() {
        let raw = serde_json::json!({"code":200,"songs":[{"id":347230,"al":{"id":42}}]});
        assert_eq!(parse_song_album(raw.clone(), 347230).unwrap(), 42);
        assert!(parse_song_album(raw, 347231).is_err());
        for al in [serde_json::json!(null), serde_json::json!({"id":0})] {
            assert!(parse_song_album(
                serde_json::json!({"code":200,"songs":[{"id":347230,"al":al}]}),
                347230
            )
            .is_err());
        }
    }
}
