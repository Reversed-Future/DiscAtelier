use crate::{AppError, LibraryCopy};
use discatelier_domain::{CopyDraft, EditionDraft};
use serde::{Deserialize, Serialize};

/// Local provenance of a user-confirmed collection record, not a live API cache.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditionSource {
    pub provider_id: String,
    pub external_id: String,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportedIdentifier {
    /// "identifier" for provider identifiers; "catalog" for label catalog numbers.
    pub namespace: String,
    pub kind: String,
    pub value: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportCopyRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub netease_album_id: Option<u64>,
    pub request_id: String,
    pub token: String,
    pub edition: EditionDraft,
    pub copy: CopyDraft,
    pub cover: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub model_token: Option<String>,
    pub existing_edition_id: Option<String>,
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub token: String,
    pub edition: EditionDraft,
    pub source: EditionSource,
    pub existing: Option<LibraryCopy>,
    pub cover: Option<String>,
}

/// Only assembled by the provider/application boundary, not accepted as raw IPC.
#[derive(Debug, Clone, Serialize)]
pub struct ImportCopy {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplement: Option<crate::MusicSupplement>,
    pub content: crate::EditionContent,
    pub request: ImportCopyRequest,
    pub source: EditionSource,
    pub identifiers: Vec<ImportedIdentifier>,
}

pub fn validate_source(
    source: &EditionSource,
    identifiers: &[ImportedIdentifier],
) -> Result<(), AppError> {
    let valid = |value: &str, max: usize| value.chars().count() <= max && !value.contains('\0');
    if source.provider_id.is_empty()
        || source.external_id.is_empty()
        || !valid(&source.provider_id, 100)
        || !valid(&source.external_id, 200)
        || chrono::DateTime::parse_from_rfc3339(&source.fetched_at).is_err()
        || identifiers.len() > 1000
        || identifiers.iter().any(|item| {
            !["identifier", "catalog"].contains(&item.namespace.as_str())
                || !valid(&item.kind, 200)
                || !valid(&item.value, 4000)
                || !valid(&item.description, 4000)
        })
    {
        return Err(AppError::new("validation", "来源资料无效或超出支持范围。"));
    }
    Ok(())
}
