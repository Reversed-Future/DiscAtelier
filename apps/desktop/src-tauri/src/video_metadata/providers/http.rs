use super::{error, AppError};
use reqwest::blocking::{Client, RequestBuilder, Response};
use serde::de::DeserializeOwned;
use std::{io::Read, time::Duration};

pub(super) fn client() -> Result<Client, AppError> {
    super::system_proxy::configure(Client::builder())
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("DiscAtelier/0.1.15 (https://github.com/Reversed-Future/DiscAtelier)")
        .build()
        .map_err(|_| error("无法建立资料查询连接。"))
}
fn connection_error(cause: reqwest::Error) -> AppError {
    // Never expose URLs, credentials, response bodies or proxy addresses.
    if cause.is_timeout() {
        error("资料源请求超时；请检查系统代理的连接状态。已有资料已保留。")
    } else if cause.is_dns() {
        error("无法解析资料源地址；请检查网络和系统代理。已有资料已保留。")
    } else {
        error("无法连接资料源或完成 TLS 握手；请检查系统代理是否可访问该站点。已有资料已保留。")
    }
}
fn send(request: RequestBuilder) -> Result<Response, AppError> {
    let retry = request.try_clone();
    match request.send() {
        Ok(response) => Ok(response),
        Err(cause) => {
            if cause.is_connect() || cause.is_timeout() {
                if let Some(retry) = retry {
                    std::thread::sleep(Duration::from_millis(400));
                    return retry.send().map_err(connection_error);
                }
            }
            Err(connection_error(cause))
        }
    }
}
pub(super) fn json<T: DeserializeOwned>(request: RequestBuilder) -> Result<T, AppError> {
    let response = send(request)?;
    match response.status().as_u16() {
        200 => (),
        401 | 403 => return Err(error("资料源拒绝访问，请在设置中检查令牌或账号权限。")),
        404 => return Err(error("该作品不存在或当前账号不可访问。")),
        429 => return Err(error("查询过于频繁，请稍后重试。")),
        _ => return Err(error("资料源暂时不可用，请稍后重试。")),
    }
    let mut bytes = Vec::new();
    response
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("资料读取中断，已有资料已保留；请重试。"))?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(error("资料超过读取限制。"));
    }
    serde_json::from_slice(&bytes).map_err(|_| error("资料源返回格式已变化，未导入。"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener};
    #[test]
    fn timeout_retries_once_then_decodes_without_credentials_in_errors() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut first, _) = listener.accept().unwrap();
            let mut bytes = [0; 2048];
            let _ = first.read(&mut bytes);
            let (mut second, _) = listener.accept().unwrap();
            let _ = second.read(&mut bytes);
            write!(
                second,
                "HTTP/1.1 200 OK\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{{\"ok\":true}}"
            )
            .unwrap();
        });
        let value: serde_json::Value = json(
            Client::builder()
                .no_proxy()
                .timeout(Duration::from_millis(100))
                .build()
                .unwrap()
                .get(format!("http://{address}/")),
        )
        .unwrap();
        assert_eq!(value["ok"], true);
        server.join().unwrap();
    }
    #[test]
    fn refused_connection_has_safe_actionable_error() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        let result: Result<serde_json::Value, _> = json(
            Client::builder()
                .no_proxy()
                .build()
                .unwrap()
                .get(format!("http://{address}/?token=private-value")),
        );
        let message = result.unwrap_err().message;
        assert!(message.contains("系统代理"));
        assert!(message.contains("已有资料已保留"));
        assert!(!message.contains("private-value"));
        assert!(!message.contains(&address.to_string()));
    }
    #[test]
    #[ignore = "Manual public network check; does not read TMDB credentials"]
    fn tmdb_public_api_uses_configured_transport() {
        let response = send(
            client()
                .unwrap()
                .get("https://api.themoviedb.org/3/tv/1399"),
        )
        .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::UNAUTHORIZED);
    }
}
