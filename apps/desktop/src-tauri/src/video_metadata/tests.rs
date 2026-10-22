use super::*;
use serde_json::json;
#[test]
fn links_only_accept_supported_work_pages() {
    assert_eq!(
        providers::parse_link("https://www.themoviedb.org/movie/550-fight-club?language=zh-CN")
            .unwrap(),
        Some((VideoSource::TmdbMovie, 550))
    );
    assert_eq!(
        providers::parse_link("https://bgm.tv/subject/311").unwrap(),
        Some((VideoSource::Bangumi, 311))
    );
    assert_eq!(providers::parse_link("千与千寻").unwrap(), None);
    for value in [
        "https://bgm.tv.evil.test/subject/311",
        "https://bgm.tv@evil.test/subject/311",
        "https://www.themoviedb.org/tv/1/season/1",
        "https://127.0.0.1/subject/311",
        "https://bgm.tv/subject/0",
    ] {
        assert!(providers::parse_link(value).is_err(), "{value}");
    }
}
#[test]
fn packaging_requires_evidence_and_bounded_values() {
    fn response(fields: serde_json::Value) -> serde_json::Value {
        json!({"choices":[{"finish_reason":"stop","message":{"content":json!({"fields":fields,"warning":""}).to_string()}}]})
    }
    let field = json!({"key":"volume","value":"第1卷","evidence":"Vol.1","image":1});
    assert!(recognition::parse(&response(json!([field])), 1).is_ok());
    for field in [
        json!({"key":"discCount","value":"1000","evidence":"1000","image":1}),
        json!({"key":"title","value":"X","evidence":"","image":1}),
        json!({"key":"title","value":"X","evidence":"X","image":2}),
        json!({"key":"releaseDate","value":"明年","evidence":"明年","image":1}),
        json!({"key":"tool","value":"save","evidence":"save","image":1}),
    ] {
        assert!(recognition::parse(&response(json!([field])), 1).is_err());
    }
}
