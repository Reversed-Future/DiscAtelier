mod bangumi;
mod bangumi_characters;
mod chapters;
pub(super) use chapters::fetch as chapters;
mod bangumi_facts;
mod links;
mod tmdb;
mod tmdb_images;
use super::{error, settings, SearchPage};
use discatelier_contracts::*;
pub(super) use links::parse_link;
mod http;
mod system_proxy;
use http::{client, json};
use reqwest::blocking::RequestBuilder;
pub(super) use tmdb_images::fetch as images;

pub fn search(source: VideoSource, query: &str, page: u32) -> Result<SearchPage, AppError> {
    let query = query.trim();
    if query.is_empty() || query.len() > 2000 || page == 0 || page > 500 {
        return Err(error("请输入作品名或有效链接。"));
    }
    if let Some((source, id)) = parse_link(query)? {
        return Ok(SearchPage {
            items: vec![detail(source, id)?],
            page: 1,
            has_more: false,
        });
    }
    match source {
        VideoSource::Bangumi => bangumi::search(query, page),
        _ => tmdb::search(source, query, page),
    }
}
pub fn detail(source: VideoSource, id: u64) -> Result<VideoWork, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(error("作品编号无效。"));
    }
    let value = match source {
        VideoSource::Bangumi => bangumi::detail(id)?,
        _ => tmdb::detail(source, id)?,
    };
    validate_video(&VideoMetadata {
        work: Some(value.clone()),
        physical: Default::default(),
        additional_works: vec![],
    })?;
    Ok(value)
}
#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::blocking::Client;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };
    #[test]
    fn http_errors_are_actionable_and_do_not_echo_remote_secrets() {
        for status in [
            "401 Unauthorized",
            "403 Forbidden",
            "429 Too Many Requests",
            "500 Internal Server Error",
            "200 OK",
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let thread = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buf = [0; 2048];
                let _ = stream.read(&mut buf);
                let body = "not-json-private-token";
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            });
            let result: Result<serde_json::Value, _> = json(
                Client::builder()
                    .no_proxy()
                    .build()
                    .unwrap()
                    .get(format!("http://{address}/")),
            );
            let error = result.unwrap_err();
            assert!(!error.message.contains("private-token"));
            assert!(!error.message.is_empty());
            thread.join().unwrap();
        }
    }
}
