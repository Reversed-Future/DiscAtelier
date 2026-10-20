use serde::Serialize;
use std::sync::Arc;

/// Trusted native asset, never accepted through IPC deserialization.
/// Constructed after bounded file reading and native model validation.
#[derive(Clone)]
pub struct PreparedModel {
    pub id: String,
    pub title: String,
    pub text: Arc<str>,
    pub preview: Arc<str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPreparation {
    pub token: String,
    pub title: String,
    pub byte_length: usize,
}
