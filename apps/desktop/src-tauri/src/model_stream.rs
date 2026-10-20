//! Read-only model transport to a Worker; never accepts a filesystem path.
use crate::commands::LibraryState;
use discatelier_storage::profiling;
use tauri::{
    http::{Request, Response},
    Manager, UriSchemeContext, UriSchemeResponder, Wry,
};

pub fn protocol(
    context: UriSchemeContext<'_, Wry>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let origin = request
        .headers()
        .get("Origin")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let id = request
        .uri()
        .path()
        .strip_prefix('/')
        .unwrap_or("")
        .to_owned();
    let allowed = matches!(
        origin.as_str(),
        "http://tauri.localhost" | "http://127.0.0.1:1420"
    );
    let valid = allowed
        && context.webview_label() == "main"
        && request.method() == "GET"
        && request.uri().query().is_none()
        && id.len() == 64
        && id.bytes().all(|b| b.is_ascii_hexdigit());
    let state = context.app_handle().state::<LibraryState>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let data = if valid {
            profiling::measure("model.display_read", || {
                state.lock().map_err(|_| ()).and_then(|service| {
                    service.as_ref().map_err(|_| ()).and_then(|service| {
                        service
                            .model(id, false)
                            .map(String::into_bytes)
                            .map_err(|_| ())
                    })
                })
            })
        } else {
            Err(())
        };
        let mut response = Response::builder()
            .status(if data.is_ok() { 200 } else { 404 })
            .header("Content-Type", "application/json")
            .header("Cache-Control", "no-store")
            .header("X-Content-Type-Options", "nosniff");
        if allowed {
            response = response.header("Access-Control-Allow-Origin", origin);
        }
        responder.respond(
            response
                .body(data.unwrap_or_default())
                .expect("constant response headers"),
        );
    });
}
