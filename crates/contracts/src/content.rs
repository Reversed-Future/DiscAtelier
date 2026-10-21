use crate::{AppError, MetadataRelease, ReleaseCompany, ReleaseCredit, ReleaseTrack};
use serde::{Deserialize, Serialize};

/// User-confirmed edition contents, stored independently of the live provider cache.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditionContent {
    pub genres: Vec<String>,
    pub styles: Vec<String>,
    pub tracks: Vec<ReleaseTrack>,
    #[serde(default)]
    pub credits: Vec<ReleaseCredit>,
    #[serde(default)]
    pub companies: Vec<ReleaseCompany>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub details_loaded: bool,
}
impl From<&MetadataRelease> for EditionContent {
    fn from(release: &MetadataRelease) -> Self {
        Self {
            genres: release.genres.clone(),
            styles: release.styles.clone(),
            tracks: release.tracklist.clone(),
            credits: release.extraartists.clone(),
            companies: release.companies.clone(),
            notes: release.notes.clone(),
            details_loaded: true,
        }
    }
}
pub fn validate_content(content: &EditionContent) -> Result<(), AppError> {
    fn tracks(rows: &[ReleaseTrack], depth: usize, total: &mut usize) -> bool {
        *total += rows.len();
        depth <= 16
            && *total <= 10000
            && rows.iter().all(|row| {
                [&row.title, &row.position, &row.duration, &row.type_]
                    .iter()
                    .all(|text| text.len() <= 16384 && !text.contains('\0'))
                    && tracks(&row.sub_tracks, depth + 1, total)
                    && valid_credits(&row.extraartists)
            })
    }
    if content.genres.len() > 100
        || content.styles.len() > 100
        || content
            .genres
            .iter()
            .chain(&content.styles)
            .any(|text| text.len() > 1000 || text.contains('\0'))
        || !tracks(&content.tracks, 0, &mut 0)
        || !valid_credits(&content.credits)
        || content.companies.len() > 1000
        || content.companies.iter().any(|c| {
            [&c.name, &c.entity_type_name, &c.catno]
                .iter()
                .any(|v| v.len() > 16384 || v.contains('\0'))
        })
        || content.notes.len() > 100_000
    {
        return Err(AppError::new("validation", "曲目或流派资料无效。"));
    }
    Ok(())
}
fn valid_credits(rows: &[ReleaseCredit]) -> bool {
    rows.len() <= 1000
        && rows.iter().all(|c| {
            [&c.name, &c.anv, &c.role, &c.tracks]
                .iter()
                .all(|v| v.len() <= 16384 && !v.contains('\0'))
        })
}
