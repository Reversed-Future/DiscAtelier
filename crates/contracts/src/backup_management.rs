use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedBackup {
    pub name: String,
    pub byte_length: u64,
    pub modified_at: String,
    pub stamp: String,
    pub incomplete: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInventory {
    pub entries: Vec<ManagedBackup>,
    pub total_bytes: u64,
    pub other_bytes: u64,
}
