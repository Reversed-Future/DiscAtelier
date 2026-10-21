use super::session::{Session, Submission, BODY_LIMIT};
use axum::{
    body::to_bytes,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::{from_fn_with_state, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    sync::{atomic::Ordering, Arc},
    time::Duration,
};

fn reject(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({"message":message}))).into_response()
}
pub fn router(session: Arc<Session>) -> Router {
    Router::new()
        .route(
            "/",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                    include_str!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../mobile-dist/index.html"
                    )),
                )
            }),
        )
        .route(
            "/phone.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
                    include_str!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../mobile-dist/phone.js"
                    )),
                )
            }),
        )
        .route(
            "/phone.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../mobile-dist/phone.css"
                    )),
                )
            }),
        )
        .route("/api/session", get(info))
        .route("/api/submit", post(submit))
        .fallback(|| async { StatusCode::NOT_FOUND })
        .layer(from_fn_with_state(session.clone(), guard))
        .with_state(session)
}
async fn guard(State(session): State<Arc<Session>>, request: Request, next: Next) -> Response {
    let headers = request.headers();
    if headers.get(header::HOST).and_then(|h| h.to_str().ok()) != Some(&session.host)
        || headers
            .get(header::ORIGIN)
            .is_some_and(|h| h.to_str().ok() != Some(&format!("http://{}", session.host)))
    {
        return reject(StatusCode::FORBIDDEN, "连接来源不符。");
    }
    if !session.live() {
        return reject(StatusCode::GONE, "连接已结束，请在电脑重新打开手机接收。");
    }
    if request.uri().path().starts_with("/api/") {
        let expected = format!("Bearer {}", session.token);
        if headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            != Some(&expected)
        {
            return reject(StatusCode::UNAUTHORIZED, "请扫描电脑上的连接二维码。");
        }
    }
    let mut response = match tokio::time::timeout(Duration::from_secs(60), next.run(request)).await
    {
        Ok(response) => response,
        Err(_) => return reject(StatusCode::REQUEST_TIMEOUT, "接收超时，请重试。"),
    };
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert("referrer-policy", "no-referrer".parse().unwrap());
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());
    headers.insert("content-security-policy","default-src 'none'; script-src 'self'; style-src 'self'; img-src data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'".parse().unwrap());
    response
}
async fn info(State(session): State<Arc<Session>>) -> Response {
    session.connected.store(true, Ordering::Release);
    Json(json!({"mode":session.mode,"maxImages":session.max_images,"requestId":session.id}))
        .into_response()
}
async fn submit(State(session): State<Arc<Session>>, request: Request) -> Response {
    if request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        != Some("application/json")
    {
        return reject(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "请使用本机提供的上传页。",
        );
    }
    let Ok(permit) = session.uploads.clone().try_acquire_owned() else {
        return reject(StatusCode::TOO_MANY_REQUESTS, "正在接收，请稍后重试。");
    };
    let bytes = match to_bytes(request.into_body(), BODY_LIMIT).await {
        Ok(bytes) => bytes,
        Err(_) => return reject(StatusCode::PAYLOAD_TOO_LARGE, "上传内容过大或不完整。"),
    };
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let request: Submission = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(_) => return reject(StatusCode::BAD_REQUEST, "上传格式无效。"),
    };
    if uuid::Uuid::parse_str(&request.id).is_err() {
        return reject(StatusCode::BAD_REQUEST, "请求编号无效。");
    }
    let state = session.clone();
    let validation = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        state.validate(&request.payload)?;
        let mut inbox = state
            .inbox
            .lock()
            .map_err(|_| super::session::error("接收状态不可用。"))?;
        // Check under the inbox lock so a cancelled upload cannot refill a cleared inbox.
        if !state.live() {
            return Err(super::session::error("连接已经结束。"));
        }
        if let Some(receipt) = &inbox.receipt {
            if receipt == &(request.id, digest) {
                return Ok(());
            }
            return Err(super::session::error("本次连接已经接收，请回到电脑确认。"));
        }
        inbox.receipt = Some((request.id, digest));
        inbox.received = Some(request.payload);
        Ok::<_, discatelier_contracts::AppError>(())
    })
    .await;
    match validation {
        Ok(Ok(())) => Json(json!({"ok":true})).into_response(),
        Ok(Err(e)) => reject(StatusCode::BAD_REQUEST, &e.message),
        Err(_) => reject(StatusCode::BAD_REQUEST, "接收未完成，请重试。"),
    }
}
pub fn serve(listener: tokio::net::TcpListener, session: Arc<Session>) {
    tauri::async_runtime::spawn(async move {
        let state = session.clone();
        let server=axum::serve(listener,router(session.clone())).with_graceful_shutdown(async move {
            loop {
                tokio::select! { _=state.shutdown.notified()=>break, _=tokio::time::sleep(Duration::from_secs(1))=>{} }
                if !state.live() {state.stop();break;}
            }
        });
        let _ = server.await;
        session.stop();
    });
}
