use super::*;
use std::{io::Write, net::TcpListener, thread};

const RELEASE: &str = r#"{"id":249504,"genres":["Rock"],"styles":["J-Rock"],"title":"Test release","artists":[{"name":"Test artist","anv":"","join":""}],"formats":[{"name":"CD","qty":"2","descriptions":["Album"],"text":"Limited"},{"name":"Blu-ray","qty":"1","descriptions":[]}],"labels":[{"name":"Label","catno":"Ab-001"}],"identifiers":[{"type":"Barcode","value":"000123"}],"tracklist":[{"position":"1-1","type_":"track","title":"Track","duration":"3:32"}],"country":"JP","released":"2020-00-00"}"#;
fn server(
    status: &str,
    headers: &str,
    body: &str,
) -> (DiscogsProvider, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}", body.len());
    let worker = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        loop {
            let length = stream.read(&mut buffer).unwrap();
            if length == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..length]);
            if request.windows(4).any(|window| window == b"\r\n\r\n") {
                break;
            }
        }
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });
    let provider = DiscogsProvider {
        client: Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
            .unwrap(),
        next_request: Instant::now(),
        cooldown: false,
        base_url: format!("http://{address}"),
    };
    (provider, worker)
}
#[test]
fn release_keeps_quantities_identifiers_and_partial_dates() {
    let (mut provider, worker) = server("200 OK", "", RELEASE);
    let release = provider.release(249504, None).unwrap();
    assert_eq!(release.genres, ["Rock"]);
    assert_eq!(release.styles, ["J-Rock"]);
    assert_eq!(release.formats.len(), 2);
    assert_eq!(release.formats[0].qty, "2");
    assert_eq!(release.identifiers[0].value, "000123");
    assert_eq!(release.labels[0].catno, "Ab-001");
    assert_eq!(release.released, "2020-00-00");
    assert_eq!(release.tracklist[0].position, "1-1");
    assert!(worker.join().unwrap().starts_with("GET /releases/249504 "));
}
#[test]
fn release_preserves_cover_and_nested_track_structure_for_preview() {
    // Exact field names verified against public releases 6061 and 3416833.
    let body = r#"{"id":7,"title":"Fixture","artists":[],"formats":[],"labels":[],
      "images":[{"type":"primary","uri":"https://i.discogs.com/full.jpg","uri150":"https://i.discogs.com/thumb.jpg"}],
      "tracklist":[{"type_":"heading","title":"Side A"},{"type_":"index","title":"Suite","sub_tracks":[
        {"type_":"track","title":"Part one","position":"A1","duration":"3:00"}]}]}"#;
    let (mut provider, worker) = server("200 OK", "", body);
    let release = provider.release(7, None).unwrap();
    let serialized = serde_json::to_value(&release).unwrap();
    assert_eq!(serialized["images"][0]["type"], "primary");
    assert_eq!(
        serialized["images"][0]["uri"],
        "https://i.discogs.com/full.jpg"
    );
    assert_eq!(release.tracklist[0].type_, "heading");
    assert_eq!(release.tracklist[1].sub_tracks[0].position, "A1");
    assert_eq!(
        serialized["tracklist"][1]["sub_tracks"][0]["title"],
        "Part one"
    );
    worker.join().unwrap();
}
#[test]
fn search_encodes_exact_query_and_never_places_token_in_url() {
    let body = r#"{"pagination":{"page":1,"pages":1,"items":1},"results":[{"id":249504,"type":"release","title":"Test","year":"2020","format":["CD"],"catno":"Ab-001"}]}"#;
    let (mut provider, worker) = server("200 OK", "", body);
    let result = provider
        .search(
            MetadataSearch {
                mode: "catalog".into(),
                query: "Ab-001 + 000".into(),
                page: 1,
            },
            "test-only-token",
        )
        .unwrap();
    assert_eq!(result.results.len(), 1);
    let request = worker.join().unwrap();
    let first = request.lines().next().unwrap();
    assert!(first.contains("catno=Ab-001+%2B+000"));
    assert!(first.contains("type=release"));
    assert!(!first.contains("test-only-token"));
    assert!(request.contains("Discogs token=test-only-token"));
    let params = search_parameters(&MetadataSearch {
        mode: "barcode".into(),
        query: "000123".into(),
        page: 1,
    })
    .unwrap();
    assert_eq!(params[0], ("barcode".into(), "000123".into()));
}
#[test]
fn errors_and_cooldown_are_distinct_and_do_not_retry() {
    for (status, code) in [
        ("401 Unauthorized", "authentication"),
        ("404 Not Found", "not_found"),
        ("429 Too Many Requests", "rate_limit"),
        ("503 Unavailable", "provider"),
    ] {
        let (mut provider, worker) = server(status, "Retry-After: 7\r\n", "{}");
        assert_eq!(provider.release(249504, None).unwrap_err().code, code);
        worker.join().unwrap();
        if status == "429 Too Many Requests" {
            assert_eq!(
                provider.release(249504, None).unwrap_err().code,
                "rate_limit"
            );
        }
    }
}

#[test]
fn mapping_preserves_multiple_identifiers_and_does_not_count_packaging_as_a_disc() {
    let mut release: MetadataRelease = serde_json::from_str(RELEASE).unwrap();
    release.formats.push(ReleaseFormat {
        name: "Box Set".into(),
        qty: "1".into(),
        descriptions: vec!["Limited Edition".into()],
        text: String::new(),
    });
    release.identifiers.push(ReleaseIdentifier {
        kind: "Barcode".into(),
        value: "0 00123".into(),
        description: "Text".into(),
    });
    let (edition, identifiers) = import_draft(&release, "music".into()).unwrap();
    assert_eq!(
        edition
            .media
            .iter()
            .map(|m| m.carrier_id.as_str())
            .collect::<Vec<_>>(),
        ["cd", "cd", "bd"]
    );
    assert_eq!(edition.barcode, "000123");
    assert_eq!(edition.catalog_number, "Ab-001");
    assert!(edition.edition_label.contains("2020-00-00"));
    assert!(edition.edition_label.contains("Box Set"));
    assert_eq!(identifiers[1].value, "0 00123");
    assert_eq!(identifiers[2].namespace, "catalog");
    // The following names are deliberately artificial unknown formats.
    release.formats[0].name = "Unmapped test format".into();
    assert_eq!(
        import_draft(&release, "music".into()).unwrap().0.media[0].carrier_id,
        ""
    );
    release.formats[0].qty = "unknown".into();
    assert!(import_draft(&release, "music".into()).is_err());
    release.formats[0].qty = "99".into();
    assert!(import_draft(&release, "music".into()).is_err());
}

#[test]
fn normal_back_to_back_requests_wait_without_rate_limit_errors() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let worker = thread::spawn(move || {
        for _ in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut buffer = [0_u8; 2048];
            let mut received = Vec::new();
            loop {
                let length = stream.read(&mut buffer).unwrap();
                assert!(length > 0);
                received.extend_from_slice(&buffer[..length]);
                if received.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                RELEASE.len(),
                RELEASE
            )
            .unwrap();
        }
    });
    let mut provider = DiscogsProvider::test_endpoint(port).unwrap();
    provider.release(249504, None).unwrap();
    let start = Instant::now();
    provider.release(249504, None).unwrap();
    assert!(start.elapsed() >= Duration::from_secs(2));
    worker.join().unwrap();
}
#[test]
fn malformed_redirected_and_wrong_release_responses_are_rejected() {
    for (status, body, code) in [
        ("200 OK", "{}", "provider_schema"),
        ("200 OK", "not json", "provider_schema"),
        ("302 Found", "{}", "provider"),
    ] {
        let (mut provider, worker) = server(status, "Location: https://example.invalid\r\n", body);
        assert_eq!(provider.release(249504, None).unwrap_err().code, code);
        worker.join().unwrap();
    }
    let (mut provider, worker) = server("200 OK", "", RELEASE);
    assert_eq!(
        provider.release(1, None).unwrap_err().code,
        "provider_schema"
    );
    worker.join().unwrap();
}
