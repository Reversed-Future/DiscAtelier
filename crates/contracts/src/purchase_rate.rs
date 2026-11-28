use serde::{Deserialize, Serialize};

/// ECB reference rates per yen, frozen together for one local purchase date.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YenPurchaseRate {
    pub purchase_date: String,
    pub quote_date: String,
    pub cny_per_jpy: String,
    pub hkd_per_jpy: String,
}
