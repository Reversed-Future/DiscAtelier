use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetadataSearch {
    pub mode: String,
    pub query: String,
    pub page: u32,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SearchResult {
    pub id: u64,
    pub title: String,
    #[serde(default)]
    pub thumb: String,
    #[serde(default)]
    pub cover_image: String,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub year: String,
    #[serde(default)]
    pub catno: String,
    #[serde(default)]
    pub format: Vec<String>,
    #[serde(rename = "type")]
    pub kind: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Pagination {
    pub page: u32,
    pub pages: u32,
    pub items: u64,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MetadataResults {
    pub results: Vec<SearchResult>,
    pub pagination: Pagination,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseArtist {
    pub name: String,
    #[serde(default)]
    pub anv: String,
    #[serde(default)]
    pub join: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseFormat {
    pub name: String,
    pub qty: String,
    #[serde(default)]
    pub descriptions: Vec<String>,
    #[serde(default)]
    pub text: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseLabel {
    pub name: String,
    pub catno: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseIdentifier {
    #[serde(rename = "type")]
    pub kind: String,
    pub value: String,
    #[serde(default)]
    pub description: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseTrack {
    pub title: String,
    #[serde(default)]
    pub position: String,
    #[serde(default)]
    pub duration: String,
    #[serde(default)]
    pub type_: String,
    #[serde(default)]
    pub sub_tracks: Vec<ReleaseTrack>,
    #[serde(default)]
    pub extraartists: Vec<ReleaseCredit>,
}
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ReleaseCredit {
    pub name: String,
    #[serde(default)]
    pub anv: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub tracks: String,
}
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ReleaseCompany {
    pub name: String,
    #[serde(default)]
    pub entity_type_name: String,
    #[serde(default)]
    pub catno: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseImage {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub uri: String,
    #[serde(default)]
    pub uri150: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MetadataRelease {
    #[serde(default)]
    pub extraartists: Vec<ReleaseCredit>,
    #[serde(default)]
    pub companies: Vec<ReleaseCompany>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub styles: Vec<String>,
    pub id: u64,
    pub title: String,
    pub artists: Vec<ReleaseArtist>,
    pub formats: Vec<ReleaseFormat>,
    pub labels: Vec<ReleaseLabel>,
    #[serde(default)]
    pub images: Vec<ReleaseImage>,
    #[serde(default)]
    pub identifiers: Vec<ReleaseIdentifier>,
    #[serde(default)]
    pub tracklist: Vec<ReleaseTrack>,
    #[serde(default)]
    pub country: String,
    #[serde(default)]
    pub released: String,
}
