mod validation;
use serde::{Deserialize, Serialize};
pub use validation::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MediumDraft {
    pub carrier_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditionDraft {
    pub category_id: String,
    pub title: String,
    pub creator: String,
    pub edition_label: String,
    pub barcode: String,
    pub catalog_number: String,
    pub media: Vec<MediumDraft>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CopyDraft {
    pub status: String,
    pub acquired_at: String,
    pub amount_minor: Option<i64>,
    pub currency: String,
    pub seller: String,
    pub purchase_url: String,
    pub storage_location: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Descriptor {
    pub id: String,
    pub label: String,
}

/// Built-in registration point. Storage and UI consume these descriptors.
pub fn categories() -> Vec<Descriptor> {
    [("music", "音乐"), ("video", "影像")]
        .into_iter()
        .map(|(id, label)| Descriptor {
            id: id.into(),
            label: label.into(),
        })
        .collect()
}
pub fn carriers() -> Vec<Descriptor> {
    [
        ("cd", "CD"),
        ("dvd", "DVD"),
        ("bd", "BD"),
        ("vinyl", "黑胶"),
        ("cassette", "磁带"),
        ("other", "其他"),
    ]
    .into_iter()
    .map(|(id, label)| Descriptor {
        id: id.into(),
        label: label.into(),
    })
    .collect()
}
