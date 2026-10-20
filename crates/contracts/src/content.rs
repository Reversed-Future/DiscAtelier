use crate::{AppError, MetadataRelease, ReleaseTrack};
use serde::{Deserialize, Serialize};

/// User-confirmed edition contents, stored independently of the live provider cache.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditionContent {
    pub genres: Vec<String>,
    pub styles: Vec<String>,
    pub tracks: Vec<ReleaseTrack>,
}
impl From<&MetadataRelease> for EditionContent {
    fn from(release: &MetadataRelease) -> Self {
        Self {
            genres: release.genres.clone(),
            styles: release.styles.clone(),
            tracks: release.tracklist.clone(),
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
    {
        return Err(AppError::new("validation", "曲目或流派资料无效。"));
    }
    Ok(())
}
