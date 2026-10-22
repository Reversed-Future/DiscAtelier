use super::{VideoMetadata, VideoSource};
use serde::{Deserialize, Serialize};

/// Explicit user grouping of source snapshots within one physical edition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoPart {
    pub id: String,
    pub label: String,
    pub source_keys: Vec<String>,
    pub cover_source_key: String,
}

pub(super) fn valid(value: &VideoMetadata) -> bool {
    if value.parts.is_empty() {
        return true;
    }
    if value.parts.len() != 2 {
        return false;
    }
    let keys: Vec<String> = value
        .work
        .iter()
        .chain(value.additional_works.iter())
        .map(|w| {
            let source = match w.source {
                VideoSource::Bangumi => "bangumi",
                VideoSource::TmdbMovie => "tmdbMovie",
                VideoSource::TmdbTv => "tmdbTv",
            };
            format!("{source}:{}", w.external_id)
        })
        .collect();
    let mut assigned = std::collections::HashSet::new();
    let mut ids = std::collections::HashSet::new();
    value.parts.iter().all(|p| {
        !p.id.trim().is_empty()
            && p.id.len() <= 200
            && !p.id.contains('\0')
            && ids.insert(&p.id)
            && !p.label.trim().is_empty()
            && p.label.len() <= 200
            && !p.label.contains('\0')
            && !p.source_keys.is_empty()
            && p.source_keys.len() <= 8
            && p.source_keys.contains(&p.cover_source_key)
            && p.source_keys
                .iter()
                .all(|key| keys.contains(key) && assigned.insert(key))
    }) && assigned.len() == keys.len()
}
