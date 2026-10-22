use super::error;
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use image::{ImageFormat, ImageReader, Limits};
use std::{
    io::{Cursor, Read},
    time::Duration,
};
const MAX_BYTES: u64 = 8 * 1024 * 1024;
fn cover_url(value: &str) -> Result<reqwest::Url, AppError> {
    let url = reqwest::Url::parse(value).map_err(|_| error("作品暂无可用封面。"))?;
    if url.scheme() != "https"
        || !matches!(url.host_str(), Some("image.tmdb.org" | "lain.bgm.tv"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(error("作品封面来源无效。"));
    }
    Ok(url)
}
fn image_data(bytes: &[u8]) -> Result<String, AppError> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES {
        return Err(error("封面为空或超过 8 MB。"));
    }
    let format = image::guess_format(bytes).map_err(|_| error("封面图片格式无效。"))?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => return Err(error("封面支持 PNG、JPEG 和 WebP。")),
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(|_| error("封面损坏或尺寸过大。"))?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
fn download(url: &str) -> Result<String, AppError> {
    let url = cover_url(url)?;
    // Public artwork only: no credentials and no redirects to other hosts.
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| error("无法建立封面连接。"))?
        .get(url)
        .send()
        .map_err(|_| error("作品封面下载失败。"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(error("作品封面暂时无法下载。"));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BYTES)
    {
        return Err(error("封面超过 8 MB。"));
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("封面下载未完成。"))?;
    image_data(&bytes)
}
#[tauri::command]
pub async fn video_cover(url: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || download(&url))
        .await
        .map_err(|_| error("封面读取未完成。"))?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cover_hosts_and_decoded_content_are_checked() {
        assert!(cover_url("https://lain.bgm.tv/pic/cover/l/a.jpg").is_ok());
        assert!(cover_url("https://image.tmdb.org/t/p/w500/a.jpg").is_ok());
        for url in [
            "http://lain.bgm.tv/a",
            "https://lain.bgm.tv.evil.test/a",
            "https://lain.bgm.tv@evil.test/a",
            "https://127.0.0.1/a",
            "file:///a",
            "https://image.tmdb.org:8080/a",
        ] {
            assert!(cover_url(url).is_err());
        }
        assert!(image_data(b"not an image").is_err());
        assert!(image_data(&vec![0; MAX_BYTES as usize + 1]).is_err());
        let mut bytes = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(7, 10)
            .write_to(&mut bytes, ImageFormat::Png)
            .unwrap();
        assert!(image_data(bytes.get_ref())
            .unwrap()
            .starts_with("data:image/png;base64,"));
    }
}
