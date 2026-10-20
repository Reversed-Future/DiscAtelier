use super::DiscogsProvider;
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::{AppError, ReleaseImage};
use image::{ImageFormat, ImageReader, Limits};
use reqwest::Url;
use std::io::{Cursor, Read};

const MAX_BYTES: u64 = 8 * 1024 * 1024;

fn cover_url(images: &[ReleaseImage]) -> Result<Option<Url>, AppError> {
    let available = |image: &&ReleaseImage| !image.uri.is_empty() || !image.uri150.is_empty();
    let image = images
        .iter()
        .filter(available)
        .find(|image| image.kind == "primary")
        .or_else(|| images.iter().find(available));
    let Some(image) = image else {
        return Ok(None);
    };
    let value = if image.uri.is_empty() {
        &image.uri150
    } else {
        &image.uri
    };
    let url = Url::parse(value).map_err(|_| failure("封面地址无效"))?;
    if url.scheme() != "https"
        || url.host_str() != Some("i.discogs.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(failure("封面来源不受支持"));
    }
    Ok(Some(url))
}

fn failure(message: &str) -> AppError {
    AppError::new("cover", format!("{message}，尚未入库，请重试。"))
}

impl DiscogsProvider {
    pub fn cover(&self, images: &[ReleaseImage]) -> Result<Option<String>, AppError> {
        let Some(url) = cover_url(images)? else {
            return Ok(None);
        };
        // In isolated debug tests only, use the already configured local HTTP fixture.
        #[cfg(any(debug_assertions, test))]
        let url = if self.base_url.starts_with("http://127.0.0.1:") {
            Url::parse(&format!("{}{}", self.base_url, url.path()))
                .map_err(|_| failure("测试封面地址无效"))?
        } else {
            url
        };
        // No API credentials are attached to artwork requests. Redirects remain disabled.
        let response = self
            .client
            .get(url)
            .send()
            .map_err(|_| failure("封面下载失败"))?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(failure("封面暂时无法下载"));
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_BYTES)
        {
            return Err(failure("封面超过 8 MB"));
        }
        let mut bytes = Vec::new();
        response
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| failure("封面下载未完成"))?;
        if bytes.is_empty() || bytes.len() as u64 > MAX_BYTES {
            return Err(failure("封面为空或超过 8 MB"));
        }
        let format = image::guess_format(&bytes).map_err(|_| failure("封面格式无效"))?;
        let media_type = match format {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::WebP => "image/webp",
            _ => return Err(failure("封面格式不受支持")),
        };
        let mut reader = ImageReader::with_format(Cursor::new(&bytes), format);
        let mut limits = Limits::default();
        limits.max_image_width = Some(8192);
        limits.max_image_height = Some(8192);
        limits.max_alloc = Some(128 * 1024 * 1024);
        reader.limits(limits);
        reader.decode().map_err(|_| failure("封面损坏或尺寸过大"))?;
        Ok(Some(format!(
            "data:{media_type};base64,{}",
            STANDARD.encode(bytes)
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn image(kind: &str, uri: &str) -> ReleaseImage {
        ReleaseImage {
            kind: kind.into(),
            uri: uri.into(),
            uri150: String::new(),
        }
    }
    #[test]
    fn selects_primary_image_and_rejects_foreign_or_credentialed_urls() {
        let images = [
            image("secondary", "https://i.discogs.com/back.jpg"),
            image("primary", "https://i.discogs.com/front.jpg"),
        ];
        assert_eq!(cover_url(&images).unwrap().unwrap().path(), "/front.jpg");
        assert!(cover_url(&[]).unwrap().is_none());
        for uri in [
            "http://i.discogs.com/front.jpg",
            "https://example.com/front.jpg",
            "https://i.discogs.com.example.com/front.jpg",
            "https://user@i.discogs.com/front.jpg",
            "https://i.discogs.com:8080/front.jpg",
            "file:///cover.jpg",
        ] {
            assert!(cover_url(&[image("primary", uri)]).is_err());
        }
    }
}
