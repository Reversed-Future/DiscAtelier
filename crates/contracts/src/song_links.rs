use crate::{AppError, SupplementTrack};
use serde::{Deserialize, Serialize};

/// Explicit track association, independent of the collection's album metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SongLink {
    pub position: String,
    pub title: String,
    pub song: SupplementTrack,
}

pub fn validate_song(song: &SupplementTrack) -> Result<(), AppError> {
    if song.id == 0
        || song.id > 9_007_199_254_740_991
        || song.title.is_empty()
        || song.title.len() > 2000
        || song.disc.len() > 100
        || song.artists.len() > 100
        || song.artists.iter().any(|v| v.len() > 1000)
        || song.duration_ms > 9_007_199_254_740_991
    {
        return Err(AppError::new("validation", "歌曲资料无效。"));
    }
    Ok(())
}

pub fn validate_song_link(link: &SongLink) -> Result<(), AppError> {
    if [&link.position, &link.title]
        .iter()
        .any(|v| v.len() > 16384 || v.contains('\0'))
    {
        return Err(AppError::new("validation", "曲目标识无效。"));
    }
    validate_song(&link.song)
}
