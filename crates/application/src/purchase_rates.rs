use crate::{LibraryRepository, LibraryService};
use discatelier_contracts::{AppError, YenPurchaseRate};

pub trait PurchaseRateRepository {
    fn yen_rate(&self, date: &str) -> Result<Option<YenPurchaseRate>, AppError>;
    fn freeze_yen_rate(&self, rate: &YenPurchaseRate) -> Result<YenPurchaseRate, AppError>;
}

impl<R: LibraryRepository + PurchaseRateRepository> LibraryService<R> {
    pub fn yen_rate(&self, date: &str) -> Result<Option<YenPurchaseRate>, AppError> {
        self.repository.yen_rate(date)
    }

    pub fn freeze_yen_rate(&self, rate: &YenPurchaseRate) -> Result<YenPurchaseRate, AppError> {
        self.repository.freeze_yen_rate(rate)
    }
}
