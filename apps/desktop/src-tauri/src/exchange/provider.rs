use super::model::{error, Quote};
use discatelier_contracts::AppError;
use serde::Deserialize;
use serde_json::Value;
use std::{io::Read, time::Duration};

const ENDPOINT: &str = "https://cn.apihz.cn/api/jinrong/huilv.php";
#[derive(Deserialize)]
struct Response {
    code: u16,
    uptime: String,
    money: String,
    from: String,
    to: String,
    rate: Rate,
}
// The official example uses a number; captured public responses use a decimal string.
#[derive(Deserialize)]
#[serde(untagged)]
enum Rate {
    Number(serde_json::Number),
    Text(String),
}

pub fn parse(value: Value, from: &str, to: &str, today: &str) -> Result<Quote, AppError> {
    if value.get("code").and_then(Value::as_u64) != Some(200) {
        // Never expose provider error text, which may echo credentials.
        return Err(error("汇率接口拒绝请求，请检查开发者 ID、KEY 和接口额度。"));
    }
    let response: Response =
        serde_json::from_value(value).map_err(|_| error("汇率接口响应格式与文档不一致。"))?;
    if response.code != 200 || response.from != from || response.to != to || response.money != "1" {
        return Err(error("汇率接口返回的币种或金额不一致，已保留原缓存。"));
    }
    // `result` is rounded by the service; use the full `rate` for local amounts.
    let rate = match response.rate {
        Rate::Number(value) => value.to_string(),
        Rate::Text(value) => value,
    };
    let quote = Quote {
        from: response.from,
        to: response.to,
        rate,
        updated_at: response.uptime,
        fetched_date: today.into(),
    };
    quote.validate()?;
    Ok(quote)
}

pub fn fetch(id: &str, key: &str, from: &str, to: &str, today: &str) -> Result<Quote, AppError> {
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent(concat!("DiscAtelier/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| error("无法建立汇率连接。"))?;
    let response = client
        .get(ENDPOINT)
        .query(&[
            ("id", id),
            ("key", key),
            ("from", from),
            ("to", to),
            ("money", "1"),
        ])
        .send()
        .map_err(|_| error("汇率更新连接失败或超时，已保留原缓存。"))?;
    if !response.status().is_success() {
        return Err(error(format!(
            "汇率接口返回 HTTP {}，已保留原缓存。",
            response.status().as_u16()
        )));
    }
    let mut bytes = Vec::new();
    response
        .take(16385)
        .read_to_end(&mut bytes)
        .map_err(|_| error("汇率响应读取失败。"))?;
    if bytes.len() > 16384 {
        return Err(error("汇率响应超出限制。"));
    }
    let value = serde_json::from_slice(&bytes).map_err(|_| error("汇率接口没有返回有效 JSON。"))?;
    parse(value, from, to, today)
}
