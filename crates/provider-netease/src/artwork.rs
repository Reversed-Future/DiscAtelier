use super::{checked, cover_url};
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use discatelier_integration_http::{error, request};
use image::{ImageFormat, ImageReader, Limits};
use serde::Deserialize;
use serde_json::Value;
use std::{
    io::{Cursor, Read},
    time::Duration,
};

const MAX_BYTES: u64 = 8 * 1024 * 1024;
#[derive(Deserialize)]
struct CoverAlbum {
    id: u64,
    #[serde(rename = "picUrl", default)]
    url: Option<String>,
}
#[derive(Deserialize)]
struct CoverResponse {
    album: CoverAlbum,
}
fn source(value: Value, id: u64) -> Result<String, AppError> {
    let response: CoverResponse =
        serde_json::from_value(checked(value)?).map_err(|_| error("网易云封面资料格式无效。"))?;
    if response.album.id != id {
        return Err(error("封面所属专辑不匹配。"));
    }
    cover_url(response.album.url.as_deref()).ok_or_else(|| error("这个专辑暂无可用封面。"))
}
pub fn album_cover(base: &str, id: u64) -> Result<String, AppError> {
    download_album_cover(
        request(base, "album", &[("id", id.to_string())], None, None)?,
        id,
    )
}
pub fn download_album_cover(value: Value, id: u64) -> Result<String, AppError> {
    let url = source(value, id)?;
    // Artwork is public; neither provider credentials nor redirects are used here.
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|_| error("无法建立封面连接。"))?;
    let response = client
        .get(url)
        .send()
        .map_err(|_| error("网易云封面下载失败，请重试。"))?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(error("网易云封面暂时无法下载。"));
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
fn image_data(bytes: &[u8]) -> Result<String, AppError> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES {
        return Err(error("封面为空或超过 8 MB。"));
    }
    let format = image::guess_format(bytes).map_err(|_| error("封面图片格式无效。"))?;
    let mime = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        _ => return Err(error("封面图片格式不受支持。")),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn album_identity_and_image_host_are_checked_before_download() {
        let response =
            json!({"code":200,"album":{"id":42,"picUrl":"http://p1.music.126.net/cover.jpg"}});
        assert_eq!(
            source(response.clone(), 42).unwrap(),
            "https://p1.music.126.net/cover.jpg"
        );
        assert!(source(response, 43).is_err());
        for url in [
            "https://127.0.0.1/cover",
            "https://p1.music.126.net.evil.test/cover",
            "file:///cover",
        ] {
            assert!(source(json!({"code":200,"album":{"id":42,"picUrl":url}}), 42).is_err());
        }
        assert!(source(json!({"code":200,"album":{"id":42}}), 42).is_err());
    }
    #[test]
    fn downloaded_images_are_decoded_and_bounded_before_storage() {
        let mut png = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(2, 2)
            .write_to(&mut png, ImageFormat::Png)
            .unwrap();
        assert!(image_data(png.get_ref())
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert!(image_data(&png.get_ref()[..10]).is_err());
        assert!(image_data(b"<html>error</html>").is_err());
        assert!(image_data(&vec![0; MAX_BYTES as usize + 1]).is_err());
    }
}
