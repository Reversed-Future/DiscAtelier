use crate::{db_error, SqliteLibrary};
use discatelier_application::purchase_rates::PurchaseRateRepository;
use discatelier_contracts::{AppError, YenPurchaseRate};
use rusqlite::{params, OptionalExtension};

impl PurchaseRateRepository for SqliteLibrary {
    fn yen_rate(&self, date: &str) -> Result<Option<YenPurchaseRate>, AppError> {
        self.connection.query_row(
            "SELECT purchase_date, quote_date, cny_per_jpy, hkd_per_jpy FROM yen_purchase_rates WHERE purchase_date = ?1",
            [date], |row| Ok(YenPurchaseRate {
                purchase_date: row.get(0)?, quote_date: row.get(1)?,
                cny_per_jpy: row.get(2)?, hkd_per_jpy: row.get(3)?,
            }),
        ).optional().map_err(db_error)
    }

    fn freeze_yen_rate(&self, rate: &YenPurchaseRate) -> Result<YenPurchaseRate, AppError> {
        self.connection.execute(
            "INSERT INTO yen_purchase_rates(purchase_date, quote_date, cny_per_jpy, hkd_per_jpy)
             VALUES (?1, ?2, ?3, ?4) ON CONFLICT(purchase_date) DO NOTHING",
            params![rate.purchase_date, rate.quote_date, rate.cny_per_jpy, rate.hkd_per_jpy],
        ).map_err(db_error)?;
        self.yen_rate(&rate.purchase_date)?
            .ok_or_else(|| AppError::new("storage", "购入汇率保存失败。"))
    }
}
