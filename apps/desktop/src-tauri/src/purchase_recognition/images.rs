use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use discatelier_integration_http::error;
use image::{ImageFormat, ImageReader, Limits};
use std::io::Cursor;

pub fn validate(images: &[String]) -> Result<(), AppError> {
    if images.is_empty() || images.len() > 6 {
        return Err(error("每次请选择 1–6 张购物截图。"));
    }
    if images.iter().map(String::len).sum::<usize>() > 24 * 1024 * 1024 {
        return Err(error("截图总大小超出限制，请减少图片。"));
    }
    for data_url in images {
        if data_url.len() > 7 * 1024 * 1024 {
            return Err(error("单张截图超出大小限制。"));
        }
        let (prefix, data) = data_url
            .split_once(',')
            .ok_or_else(|| error("截图编码无效。"))?;
        let format = match prefix {
            "data:image/png;base64" => ImageFormat::Png,
            "data:image/jpeg;base64" => ImageFormat::Jpeg,
            "data:image/webp;base64" => ImageFormat::WebP,
            _ => return Err(error("截图仅支持 PNG、JPEG、WebP。")),
        };
        let bytes = STANDARD.decode(data).map_err(|_| error("截图编码无效。"))?;
        if bytes.len() > 5 * 1024 * 1024 || image::guess_format(&bytes).ok() != Some(format) {
            return Err(error("截图内容与格式不一致，或文件过大。"));
        }
        let mut reader = ImageReader::with_format(Cursor::new(&bytes), format);
        let mut limits = Limits::default();
        limits.max_image_width = Some(4096);
        limits.max_image_height = Some(4096);
        limits.max_alloc = Some(96 * 1024 * 1024);
        reader.limits(limits);
        reader
            .decode()
            .map_err(|_| error("截图损坏或尺寸超出 4096 像素。"))?;
    }
    Ok(())
}
