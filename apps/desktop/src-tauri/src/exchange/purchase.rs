use super::model::error;
use crate::commands::{run, LibraryState};
use chrono::{Datelike, Days, Local, NaiveDate, Weekday};
use discatelier_contracts::{AppError, YenPurchaseRate};
use serde::Deserialize;
use std::{io::Read, time::Duration};

const URL: &str = "https://api.frankfurter.dev/v2/rates";

#[derive(Deserialize)]
struct Observation {
    date: NaiveDate,
    base: String,
    quote: String,
    rate: serde_json::Number,
}

fn select(rows: &[Observation], date: NaiveDate) -> Result<YenPurchaseRate, AppError> {
    let unavailable = || error("该购入日的日元汇率尚未公布或暂无数据。");
    let latest = rows
        .iter()
        .filter(|row| row.date <= date)
        .map(|row| row.date)
        .max()
        .ok_or_else(unavailable)?;
    // On a holiday a later observation confirms the gap. A weekend immediately
    // following a published Friday can already be settled before Monday.
    let days = (date - latest).num_days();
    let weekend = matches!(
        (date.weekday(), days),
        (Weekday::Sat, 1) | (Weekday::Sun, 2)
    );
    if days > 7 || (days > 0 && !weekend && !rows.iter().any(|r| r.date > date)) {
        return Err(unavailable());
    }
    let mut cny = None;
    let mut hkd = None;
    for row in rows.iter().filter(|row| row.date == latest) {
        let slot = match row.quote.as_str() {
            "CNY" => &mut cny,
            "HKD" => &mut hkd,
            _ => return Err(unavailable()),
        };
        if row.base != "JPY"
            || !row
                .rate
                .as_f64()
                .is_some_and(|v| (1e-12..=1e12).contains(&v))
            || slot.replace(row.rate.to_string()).is_some()
        {
            return Err(unavailable());
        }
    }
    Ok(YenPurchaseRate {
        purchase_date: date.to_string(),
        quote_date: latest.to_string(),
        cny_per_jpy: cny.ok_or_else(unavailable)?,
        hkd_per_jpy: hkd.ok_or_else(unavailable)?,
    })
}

fn fetch(date: NaiveDate, today: NaiveDate) -> Result<YenPurchaseRate, AppError> {
    let from = date
        .checked_sub_days(Days::new(7))
        .ok_or_else(|| error("购入日期无效。"))?;
    let to = date
        .checked_add_days(Days::new(7))
        .unwrap_or(date)
        .min(today);
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| error("无法建立历史汇率连接。"))?;
    let response = client
        .get(URL)
        .query(&[
            ("providers", "ecb"),
            ("base", "JPY"),
            ("quotes", "CNY,HKD"),
            ("from", &from.to_string()),
            ("to", &to.to_string()),
        ])
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|_| error("未能取得购入日汇率，联网后可重试。"))?;
    let mut bytes = Vec::new();
    response
        .take(16_385)
        .read_to_end(&mut bytes)
        .map_err(|_| error("历史汇率读取失败。"))?;
    if bytes.len() > 16_384 {
        return Err(error("历史汇率响应过大。"));
    }
    let rows = serde_json::from_slice::<Vec<Observation>>(&bytes)
        .map_err(|_| error("历史汇率格式无效。"))?;
    select(&rows, date)
}

#[tauri::command]
pub async fn exchange_purchase_rate(
    state: tauri::State<'_, LibraryState>,
    purchase_date: String,
) -> Result<YenPurchaseRate, AppError> {
    let date = NaiveDate::parse_from_str(&purchase_date, "%Y-%m-%d")
        .map_err(|_| error("购入日期无效。"))?;
    let today = Local::now().date_naive();
    if date.to_string() != purchase_date || date > today {
        return Err(error("请填写已发生的购入日期。"));
    }
    if let Some(rate) = run(state.inner().clone(), move |s| s.yen_rate(&purchase_date)).await? {
        return Ok(rate);
    }
    // Network I/O never holds the collection lock.
    let rate = tauri::async_runtime::spawn_blocking(move || fetch(date, today))
        .await
        .map_err(|_| error("购入日汇率查询未完成。"))??;
    run(state.inner().clone(), move |s| s.freeze_yen_rate(&rate)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settles_published_weekend_and_confirmed_holiday_only() {
        let rows: Vec<Observation> = serde_json::from_str(r#"[{"date":"2024-05-17","base":"JPY","quote":"CNY","rate":0.046384},{"date":"2024-05-17","base":"JPY","quote":"HKD","rate":0.050071}]"#).unwrap();
        let day = |d| NaiveDate::from_ymd_opt(2024, 5, d).unwrap();
        assert_eq!(select(&rows, day(17)).unwrap().cny_per_jpy, "0.046384");
        assert_eq!(select(&rows, day(18)).unwrap().quote_date, "2024-05-17");
        assert!(select(&rows, day(20)).is_err());
        assert!(select(&rows[..1], day(17)).is_err());
        assert!(select(&rows, day(16)).is_err());
        let mut more = rows;
        more.push(Observation {
            date: day(21),
            base: "JPY".into(),
            quote: "CNY".into(),
            rate: 1.into(),
        });
        assert_eq!(select(&more, day(20)).unwrap().quote_date, "2024-05-17");
    }
}
