use super::*;
use serde_json::json;
fn dir() -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("discatelier-exchange-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&path).unwrap();
    path
}
fn configured() -> Document {
    Document {
        settings: Settings {
            enabled: true,
            developer_id: "12345678".into(),
            target: "CNY".into(),
        },
        cache: Cache::default(),
    }
}
fn quote(from: &str, to: &str, date: &str) -> Quote {
    Quote {
        from: from.into(),
        to: to.into(),
        rate: "0.5".into(),
        updated_at: format!("{date} 08:00:00"),
        fetched_date: date.into(),
    }
}

#[test]
fn captured_api_rates_preserve_precision_instead_of_rounded_result() {
    for (raw, from, rate) in [
        (
            include_str!("fixtures/apihz-jpy.json"),
            "JPY",
            "0.042290632517137",
        ),
        (
            include_str!("fixtures/apihz-hkd.json"),
            "HKD",
            "0.85257953951811",
        ),
    ] {
        let value = provider::parse(
            serde_json::from_str(raw).unwrap(),
            from,
            "CNY",
            "2026-10-22",
        )
        .unwrap();
        assert_eq!(value.rate, rate);
        assert_eq!(value.updated_at, "2026-10-21 08:00:02");
    }
    let numeric = json!({"code":200,"uptime":"2026-10-22 08:00:01","money":"1","from":"HKD","to":"CNY","rate":0.9,"result":0.9});
    assert_eq!(
        provider::parse(numeric, "HKD", "CNY", "2026-10-22")
            .unwrap()
            .rate,
        "0.9"
    );
}
#[test]
fn provider_rejects_bad_identity_rates_and_redacts_error_messages() {
    let good: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/apihz-jpy.json")).unwrap();
    for rate in [
        json!(0),
        json!(-1),
        json!(null),
        json!(true),
        json!("NaN"),
        json!("1e999"),
        json!(" 0.1"),
        json!("-0.1"),
    ] {
        let mut v = good.clone();
        v["rate"] = rate;
        assert!(provider::parse(v, "JPY", "CNY", "2026-10-22").is_err());
    }
    assert!(provider::parse(good.clone(), "HKD", "CNY", "2026-10-22").is_err());
    let mut wrong = good;
    wrong["money"] = json!("10");
    assert!(provider::parse(wrong, "JPY", "CNY", "2026-10-22").is_err());
    let e = provider::parse(
        json!({"code":400,"msg":"secret-do-not-expose"}),
        "JPY",
        "CNY",
        "2026-10-22",
    )
    .unwrap_err();
    assert!(!e.message.contains("secret"));
}
#[test]
fn daily_requests_are_persisted_across_restarts_and_resume_next_day() {
    let directory = dir();
    let mut calls = 0;
    let value = refresh(
        &directory,
        configured(),
        "2026-10-22",
        1000,
        false,
        |from, to| {
            calls += 1;
            Ok(quote(from, to, "2026-10-22"))
        },
    )
    .unwrap();
    assert_eq!(calls, 2);
    assert_eq!(value.cache.rates.len(), 2);
    let restored = storage::read(&directory).unwrap();
    refresh(&directory, restored, "2026-10-22", 1100, false, |_, _| {
        panic!("same day must be cached")
    })
    .unwrap();
    refresh(
        &directory,
        storage::read(&directory).unwrap(),
        "2026-10-23",
        2000,
        false,
        |from, to| {
            calls += 1;
            Ok(quote(from, to, "2026-10-23"))
        },
    )
    .unwrap();
    assert_eq!(calls, 4);
}
#[test]
fn failure_keeps_last_good_rates_and_never_automatically_hammers_the_api() {
    let directory = dir();
    let old = refresh(
        &directory,
        configured(),
        "2026-10-21",
        1000,
        false,
        |from, to| Ok(quote(from, to, "2026-10-21")),
    )
    .unwrap();
    let failed = refresh(&directory, old, "2026-10-22", 2000, false, |_, _| {
        Err(error("offline"))
    })
    .unwrap();
    assert_eq!(failed.cache.rates.len(), 2);
    assert_eq!(failed.cache.rates[0].fetched_date, "2026-10-21");
    assert_eq!(failed.cache.last_error, "offline");
    refresh(
        &directory,
        storage::read(&directory).unwrap(),
        "2026-10-22",
        2100,
        false,
        |_, _| panic!("failed auto request is attempted once"),
    )
    .unwrap();
    refresh(
        &directory,
        storage::read(&directory).unwrap(),
        "2026-10-22",
        2010,
        true,
        |_, _| panic!("manual request is rate limited"),
    )
    .unwrap();
    let retried = refresh(
        &directory,
        storage::read(&directory).unwrap(),
        "2026-10-22",
        2200,
        true,
        |from, to| Ok(quote(from, to, "2026-10-22")),
    )
    .unwrap();
    assert!(retried.cache.last_error.is_empty());
    assert!(retried
        .cache
        .rates
        .iter()
        .all(|q| q.fetched_date == "2026-10-22"));
}
#[test]
fn disabled_clock_rollback_and_currency_changes_do_not_mix_rates() {
    let directory = dir();
    refresh(
        &directory,
        Document::default(),
        "2026-10-22",
        1000,
        false,
        |_, _| panic!("disabled"),
    )
    .unwrap();
    let mut value = refresh(
        &directory,
        configured(),
        "2026-10-22",
        1000,
        false,
        |from, to| Ok(quote(from, to, "2026-10-22")),
    )
    .unwrap();
    assert!(!model::due(&value, "2026-10-21", 900, false));
    value.settings.target = "JPY".into();
    value.cache.attempt_date.clear();
    assert!(status(value.clone(), true, "2026-10-22".into())
        .rates
        .is_empty());
    let value = refresh(&directory, value, "2026-10-22", 1100, false, |from, to| {
        Ok(quote(from, to, "2026-10-22"))
    })
    .unwrap();
    assert_eq!(value.cache.rates.len(), 2);
    assert!(value.cache.rates.iter().all(|r| r.to == "JPY"));
}
#[test]
fn settings_cache_roundtrip_is_separate_from_library_and_contains_no_key() {
    let directory = dir();
    std::fs::write(directory.join("library.sqlite3"), b"unchanged library").unwrap();
    let value = refresh(
        &directory,
        configured(),
        "2026-10-22",
        1000,
        false,
        |from, to| Ok(quote(from, to, "2026-10-22")),
    )
    .unwrap();
    let encoded = serde_json::to_value(&value).unwrap();
    assert_eq!(encoded["settings"].as_object().unwrap().len(), 3);
    assert_eq!(
        std::fs::read(directory.join("library.sqlite3")).unwrap(),
        b"unchanged library"
    );
    let mut invalid = value;
    invalid.cache.rates[0].to = "HKD".into();
    storage::write(&directory, &invalid).unwrap();
    assert!(storage::read(&directory).is_err());
}
