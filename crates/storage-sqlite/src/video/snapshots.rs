use discatelier_contracts::{AppError, VideoMetadata, VideoWork};
use serde::{Deserialize, Serialize};

// Legacy single-source JSON is retained byte-for-byte in shape until a source is added.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Sources {
    work: Option<VideoWork>,
    additional_works: Vec<VideoWork>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum Stored {
    Sources(Sources),
    Legacy(Option<VideoWork>),
}
pub(super) fn encode(value: &VideoMetadata) -> Result<String, AppError> {
    if value.additional_works.is_empty() {
        serde_json::to_string(&value.work)
    } else {
        serde_json::to_string(&Sources {
            work: value.work.clone(),
            additional_works: value.additional_works.clone(),
        })
    }
    .map_err(|_| super::invalid())
}
pub(super) fn decode(text: &str) -> Result<VideoMetadata, AppError> {
    let (work, additional_works) = match serde_json::from_str(text).map_err(|_| super::invalid())? {
        Stored::Legacy(work) => (work, vec![]),
        Stored::Sources(value) => (value.work, value.additional_works),
    };
    Ok(VideoMetadata {
        work,
        additional_works,
        physical: Default::default(),
    })
}
