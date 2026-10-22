use serde::{Deserialize, Serialize};

/// Optional text supplied by the CD metadata reader, keyed by the physical track number.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CdTrackMetadata {
    pub number: u8,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub date: Option<String>,
    pub genre: Option<String>,
    pub track_total: Option<u8>,
}
