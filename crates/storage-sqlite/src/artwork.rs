use crate::db_error;
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use image::{ImageFormat, ImageReader, Limits};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::io::Cursor;

pub struct Artwork {
    id: String,
    media_type: &'static str,
    bytes: Vec<u8>,
}
pub fn decode(data_url: &str) -> Result<Artwork, AppError> {
    if data_url.len() > 11_184_840 {
        return Err(invalid("封面不能超过 8 MB"));
    }
    let (prefix, data) = data_url
        .split_once(',')
        .ok_or_else(|| invalid("封面文件无效"))?;
    let (media_type, expected) = match prefix {
        "data:image/png;base64" => ("image/png", ImageFormat::Png),
        "data:image/jpeg;base64" => ("image/jpeg", ImageFormat::Jpeg),
        "data:image/webp;base64" => ("image/webp", ImageFormat::WebP),
        _ => return Err(invalid("封面支持 PNG、JPEG 和 WebP")),
    };
    let bytes = STANDARD.decode(data).map_err(|_| invalid("封面编码无效"))?;
    if bytes.is_empty() || bytes.len() > 8_388_608 {
        return Err(invalid("封面不能超过 8 MB"));
    }
    if image::guess_format(&bytes).map_err(|_| invalid("无法识别封面图片"))? != expected {
        return Err(invalid("封面格式与文件内容不一致"));
    }
    let mut reader = ImageReader::with_format(Cursor::new(&bytes), expected);
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|_| invalid("封面损坏或尺寸过大，请使用 8192 像素以内的图片"))?;
    Ok(Artwork {
        id: format!("{:x}", Sha256::digest(&bytes)),
        media_type,
        bytes,
    })
}
pub fn save(transaction: &Transaction<'_>, artwork: &Artwork) -> Result<String, AppError> {
    transaction
        .execute(
            "INSERT OR IGNORE INTO assets (id,media_type,byte_length,data) VALUES (?1,?2,?3,?4)",
            params![
                artwork.id,
                artwork.media_type,
                artwork.bytes.len() as i64,
                artwork.bytes
            ],
        )
        .map_err(db_error)?;
    Ok(artwork.id.clone())
}
pub fn read(connection: &Connection, id: &str) -> Result<String, AppError> {
    let asset: Option<(String, Vec<u8>)> = connection
        .query_row(
            "SELECT media_type,data FROM assets WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    let (media_type, bytes) = asset.ok_or_else(|| AppError::new("not_found", "封面不存在"))?;
    Ok(format!(
        "data:{media_type};base64,{}",
        STANDARD.encode(bytes)
    ))
}
fn invalid(message: &str) -> AppError {
    AppError::new("validation", message)
}
