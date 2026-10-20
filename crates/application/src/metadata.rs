use discatelier_contracts::{AppError, MetadataRelease, MetadataResults, MetadataSearch};

/// Metadata providers cannot read or modify the personal collection.
pub trait MetadataProvider: Send {
    fn search(&mut self, request: MetadataSearch, token: &str)
        -> Result<MetadataResults, AppError>;
    fn release(&mut self, id: u64, token: Option<&str>) -> Result<MetadataRelease, AppError>;
}
