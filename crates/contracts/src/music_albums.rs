use crate::MusicSupplement;
use serde::{Deserialize, Serialize};

/// Internal association metadata, separate from the provider album contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkedMusicAlbum {
    pub album: MusicSupplement,
    pub legacy_positions: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscAlbumLink {
    pub disc_key: String,
    pub album_id: u64,
}
impl LinkedMusicAlbum {
    pub fn track_position(&self, disc: &str, number: u32) -> String {
        if self.legacy_positions {
            format!("{disc}-{number}")
        } else {
            format!("netease:{}:{disc}:{number}", self.album.album_id)
        }
    }
}
