use super::*;
use serde_json::json;
use std::time::Duration;

fn fixture(host: String, mode: Mode) -> Session {
    Session {
        id: uuid::Uuid::new_v4().to_string(),
        token: "a".repeat(64),
        host,
        mode,
        max_images: 2,
        created: Instant::now(),
        heartbeat: Mutex::new(Instant::now()),
        closed: AtomicBool::new(false),
        connected: AtomicBool::new(false),
        inbox: Mutex::new(Inbox {
            received: None,
            receipt: None,
        }),
        uploads: Arc::new(tokio::sync::Semaphore::new(1)),
        shutdown: tokio::sync::Notify::new(),
    }
}
fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}
async fn server(mode: Mode) -> (Arc<Session>, String, reqwest::Client) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let host = listener.local_addr().unwrap().to_string();
    let session = Arc::new(fixture(host.clone(), mode));
    http::serve(listener, session.clone());
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    (session, format!("http://{host}"), client)
}
fn picture() -> String {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 2)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    format!(
        "data:image/png;base64,{}",
        STANDARD.encode(bytes.into_inner())
    )
}

#[test]
fn checks_barcode_checksum_and_preserves_leading_zeroes() {
    for value in ["4006381333931", "036000291452", "96385074", "0036000291452"] {
        assert!(session::valid_barcode(value));
    }
    for value in [
        "4006381333932",
        "123",
        "03600029145x",
        " 036000291452",
        "４００６３８１３３３９３１",
    ] {
        assert!(!session::valid_barcode(value));
    }
}

#[test]
fn capabilities_limits_expiry_and_shutdown_are_enforced() {
    let mut state = fixture("127.0.0.1:1".into(), Mode::Screenshots);
    assert!(state
        .validate(&Payload::Screenshots {
            images: vec![picture(), picture()]
        })
        .is_ok());
    for images in [
        vec![],
        vec![picture(); 3],
        vec!["https://example.com/file.png".into()],
        vec!["data:image/png;base64,bm90LWltYWdl".into()],
    ] {
        assert!(state.validate(&Payload::Screenshots { images }).is_err());
    }
    assert!(state
        .validate(&Payload::Barcode {
            value: "036000291452".into()
        })
        .is_err());
    state.created = Instant::now() - LIFETIME;
    assert!(!state.live());
    state.created = Instant::now();
    *state.heartbeat.lock().unwrap() = Instant::now() - Duration::from_secs(46);
    assert!(!state.live());
    *state.heartbeat.lock().unwrap() = Instant::now();
    assert!(state.live());
    state.inbox.lock().unwrap().received = Some(Payload::Screenshots {
        images: vec![picture()],
    });
    state.stop();
    assert!(!state.live());
    assert!(state.inbox.lock().unwrap().received.is_none());
}

#[test]
fn http_authentication_origin_host_and_surface_are_restricted() {
    runtime().block_on(async {
        let (state, base, client) = server(Mode::Barcode).await;
        let response = client.get(format!("{base}/")).send().await.unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert!(response.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .contains("frame-ancestors 'none'"));
        assert!(!response.text().await.unwrap().contains(&state.token));
        assert_eq!(
            client
                .get(format!("{base}/api/session"))
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            client
                .get(format!("{base}/api/session"))
                .bearer_auth("wrong")
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        assert_eq!(
            client
                .get(format!("{base}/api/session"))
                .bearer_auth(&state.token)
                .header("Origin", "https://example.com")
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        assert_eq!(
            client
                .get(format!("{base}/api/session"))
                .bearer_auth(&state.token)
                .header("Host", "example.com")
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        let response = client
            .get(format!("{base}/api/session"))
            .bearer_auth(&state.token)
            .header("Origin", &base)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let info: serde_json::Value =
            serde_json::from_str(&response.text().await.unwrap()).unwrap();
        assert_eq!(
            info,
            json!({"mode":"barcode","maxImages":2,"requestId":state.id})
        );
        assert!(state.connected.load(Ordering::Acquire));
        assert_eq!(
            client
                .get(format!("{base}/api/library"))
                .bearer_auth(&state.token)
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        assert_eq!(
            client
                .get(format!("{base}/Cargo.toml"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
        state.stop();
    });
}

#[test]
fn barcode_submissions_are_idempotent_and_can_continue() {
    runtime().block_on(async {
    let (state,base,client)=server(Mode::Barcode).await;
    let valid=json!({"id":state.id,"payload":{"kind":"barcode","value":"036000291452"}});
    for invalid in [json!({"id":state.id,"payload":{"kind":"barcode","value":"036000291451"}}),
        json!({"id":state.id,"payload":{"kind":"screenshots","images":[picture()]}}),
        json!({"id":state.id,"payload":{"kind":"barcode","value":"036000291452","save":true}})] {
        assert_eq!(client.post(format!("{base}/api/submit")).bearer_auth(&state.token).header("Content-Type","application/json").body(invalid.to_string()).send().await.unwrap().status(),400);
    }
    assert!(state.inbox.lock().unwrap().received.is_none());
    for _ in 0..2 {
        assert_eq!(client.post(format!("{base}/api/submit")).bearer_auth(&state.token).header("Content-Type","application/json").body(valid.to_string()).send().await.unwrap().status(),200);
    }
    assert!(matches!(state.inbox.lock().unwrap().received.take(),Some(Payload::Barcode{value}) if value=="036000291452"));
    let different=json!({"id":state.id,"payload":{"kind":"barcode","value":"4006381333931"}});
    assert_eq!(client.post(format!("{base}/api/submit")).bearer_auth(&state.token).header("Content-Type","application/json").body(different.to_string()).send().await.unwrap().status(),200);
    assert!(matches!(state.inbox.lock().unwrap().received.take(),Some(Payload::Barcode{value}) if value=="4006381333931"));
    assert!(state.live());
    state.stop();
});
}

#[test]
fn screenshot_submissions_remain_one_shot() {
    runtime().block_on(async {
        let (state, base, client) = server(Mode::Screenshots).await;
        let first = json!({"id":state.id,"payload":{"kind":"screenshots","images":[picture()]}});
        assert_eq!(
            client
                .post(format!("{base}/api/submit"))
                .bearer_auth(&state.token)
                .header("Content-Type", "application/json")
                .body(first.to_string())
                .send()
                .await
                .unwrap()
                .status(),
            200
        );
        let second =
            json!({"id":state.id,"payload":{"kind":"screenshots","images":[picture(),picture()]}});
        assert_eq!(
            client
                .post(format!("{base}/api/submit"))
                .bearer_auth(&state.token)
                .header("Content-Type", "application/json")
                .body(second.to_string())
                .send()
                .await
                .unwrap()
                .status(),
            400
        );
        state.stop();
    });
}

#[test]
fn images_transfer_without_files_and_oversize_requests_are_rejected() {
    runtime().block_on(async {
    let (state,base,client)=server(Mode::Screenshots).await;
    let oversized=" ".repeat(session::BODY_LIMIT+1);
    assert_eq!(client.post(format!("{base}/api/submit")).bearer_auth(&state.token).header("Content-Type","application/json").body(oversized).send().await.unwrap().status(),413);
    let images=vec![picture(),picture()];
    let body=json!({"id":state.id,"payload":{"kind":"screenshots","images":images}});
    assert_eq!(client.post(format!("{base}/api/submit")).bearer_auth(&state.token).header("Content-Type","text/plain").body(body.to_string()).send().await.unwrap().status(),415);
    assert_eq!(client.post(format!("{base}/api/submit")).bearer_auth(&state.token).header("Content-Type","application/json").body(body.to_string()).send().await.unwrap().status(),200);
    assert!(matches!(state.inbox.lock().unwrap().received.take(),Some(Payload::Screenshots{images:received}) if received==images));
    state.stop();
});
}

#[test]
fn closing_the_connection_releases_the_listening_port() {
    runtime().block_on(async {
        let (state, base, client) = server(Mode::Barcode).await;
        assert_eq!(client.get(&base).send().await.unwrap().status(), 200);
        state.stop();
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if tokio::net::TcpStream::connect(&state.host).await.is_err() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("closed connection must release the port");
    });
}
