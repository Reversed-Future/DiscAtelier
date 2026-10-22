use super::error;
use discatelier_contracts::AppError;

pub fn web_url(value: &str) -> Option<String> {
    let url = reqwest::Url::parse(value).ok()?;
    if !["https", "http"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return None;
    }
    Some(url.to_string())
}
#[tauri::command]
pub fn video_open_reference(app: tauri::AppHandle, url: String) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let url = web_url(&url).ok_or_else(|| error("资料链接无效。"))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| error("无法打开系统浏览器。"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reference_links_only_open_web_pages() {
        assert_eq!(
            web_url("https://bgm.tv/person/7405").unwrap(),
            "https://bgm.tv/person/7405"
        );
        assert!(web_url("http://king-cr.jp/special/yosuganosora/").is_some());
        for url in [
            "javascript:alert(1)",
            "file:///C:/Windows/test.exe",
            "data:text/html,test",
            "https://user:secret@example.com/",
        ] {
            assert!(web_url(url).is_none());
        }
    }
}
