use crate::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MusicSupplement {
    pub album_id: u64,
    pub title: String,
    pub artists: Vec<String>,
    pub description: String,
    pub company: String,
    pub published_at: i64,
    pub tracks: Vec<SupplementTrack>,
    #[serde(default)]
    pub links: Vec<SupplementLink>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupplementLink {
    pub position: String,
    pub title: String,
    pub song_id: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupplementTrack {
    pub id: u64,
    pub title: String,
    pub artists: Vec<String>,
    pub disc: String,
    pub number: u32,
    pub duration_ms: u64,
}
pub fn validate_supplement(value: &MusicSupplement) -> Result<(), AppError> {
    if value.album_id == 0
        || value.album_id > 9_007_199_254_740_991
        || value.title.len() > 2000
        || value.description.len() > 100_000
        || value.company.len() > 2000
        || value.artists.len() > 100
        || value.artists.iter().any(|s| s.len() > 1000)
        || value.tracks.len() > 1000
        || value.links.len() > 1000
        || value.links.iter().any(|link| {
            link.position.len() > 16384
                || link.title.len() > 16384
                || !value.tracks.iter().any(|t| t.id == link.song_id)
        })
        || value.tracks.iter().any(|t| {
            t.id == 0
                || t.title.len() > 2000
                || t.disc.len() > 100
                || t.artists.len() > 100
                || t.artists.iter().any(|s| s.len() > 1000)
        })
    {
        return Err(AppError::new("validation", "补充资料超出限制。"));
    }
    Ok(())
}
