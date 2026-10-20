use discatelier_domain::{CopyDraft, Descriptor, EditionDraft};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
mod supplements;
pub use supplements::*;
mod content;
pub use content::*;
mod models;
pub use models::*;
mod metadata;
pub use metadata::*;
mod imports;
pub use imports::*;
mod optical;
pub use optical::*;
mod playback;
pub use playback::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCopy {
    pub request_id: String,
    pub edition: Option<EditionDraft>,
    pub existing_edition_id: Option<String>,
    pub copy: CopyDraft,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub model_token: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum CoverChange {
    Keep,
    Remove,
    Replace {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEdition {
    pub request_id: String,
    pub edition_id: String,
    pub expected_revision: i64,
    pub edition: EditionDraft,
    pub cover: CoverChange,
    #[serde(default)]
    pub model: ModelChange,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCopy {
    pub request_id: String,
    pub id: String,
    pub expected_revision: i64,
    pub copy: CopyDraft,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LibraryQuery {
    pub category_id: String,
    pub status: Option<String>,
    pub query: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCopy {
    pub id: String,
    pub edition_id: String,
    pub edition_revision: i64,
    pub edition_copy_count: i64,
    pub cover_asset_id: Option<String>,
    pub model_asset_id: Option<String>,
    pub model_title: Option<String>,
    pub revision: i64,
    pub added_at: String,
    pub edition: EditionDraft,
    pub copy: CopyDraft,
    pub source: Option<EditionSource>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub copies: Vec<LibraryCopy>,
    pub categories: Vec<Descriptor>,
    pub carriers: Vec<Descriptor>,
    /// Decimal minor-unit strings avoid JavaScript aggregate rounding.
    pub amounts: BTreeMap<String, String>,
    pub owned_count: usize,
    pub medium_count: usize,
    pub unpriced_count: usize,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
}
impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for AppError {}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub path: String,
    pub name: String,
    pub byte_length: u64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub token: String,
    pub copies: i64,
    pub editions: i64,
    pub assets: i64,
    pub models: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum ModelChange {
    #[default]
    Keep,
    Remove,
    Replace {
        text: String,
    },
    Prepared {
        token: String,
    },
}
