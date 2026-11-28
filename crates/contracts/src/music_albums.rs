use crate::{MusicSupplement, SupplementTrack};
use serde::{Deserialize, Serialize};

/// Resolved by the desktop host using provider data. Track selections from
/// saved albums can be resolved inside the edition's save transaction.
#[derive(Debug, Clone, Default, Serialize)]
pub struct EditionMusicEdits {
    pub albums: Vec<AlbumReplacement>,
    pub tracks: Vec<TrackAssociationEdit>,
}
#[derive(Debug, Clone, Serialize)]
pub struct AlbumReplacement {
    pub previous_id: Option<u64>,
    pub album: MusicSupplement,
}
#[derive(Debug, Clone, Serialize)]
pub struct TrackAssociationEdit {
    pub position: String,
    pub title: String,
    pub song_id: Option<u64>,
    #[serde(skip)]
    pub cached_song: Option<SupplementTrack>,
}

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
