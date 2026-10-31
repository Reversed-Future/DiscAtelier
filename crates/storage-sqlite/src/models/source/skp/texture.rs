//! Normalize embedded SketchUp textures into glTF's core image formats.
use super::invalid;
use discatelier_contracts::AppError;
use image::{ImageFormat, ImageReader};
use std::{borrow::Cow, io::Cursor};

pub fn prepare(data: &[u8]) -> Result<(Cow<'_, [u8]>, &'static str), AppError> {
    let mut reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|_| invalid("SKP 贴图无效。"))?;
    let format = reader
        .format()
        .ok_or_else(|| invalid("无法识别 SKP 贴图格式。"))?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    let (w, h) = ImageReader::with_format(Cursor::new(data), format)
        .into_dimensions()
        .map_err(|_| invalid("SKP 贴图无效或格式暂不支持。"))?;
    if w > 8192 || h > 8192 {
        return Err(invalid("SKP 贴图单边不能超过 8192 像素。"));
    }
    match format {
        ImageFormat::Png => Ok((Cow::Borrowed(data), "image/png")),
        ImageFormat::Jpeg => Ok((Cow::Borrowed(data), "image/jpeg")),
        ImageFormat::Bmp | ImageFormat::WebP => {
            let image = reader.decode().map_err(|_| invalid("SKP 贴图无法解码。"))?;
            let mut output = Cursor::new(Vec::new());
            image
                .write_to(&mut output, ImageFormat::Png)
                .map_err(|_| invalid("SKP 贴图转换失败。"))?;
            Ok((Cow::Owned(output.into_inner()), "image/png"))
        }
        _ => Err(invalid("SKP 内嵌贴图支持 PNG、JPEG、BMP 和 WebP。")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bitmap_keeps_pixels_when_converted_for_gltf() {
        let source =
            image::RgbImage::from_fn(2, 2, |x, y| image::Rgb([x as u8 * 80, y as u8 * 90, 123]));
        let mut bmp = Cursor::new(Vec::new());
        source.write_to(&mut bmp, ImageFormat::Bmp).unwrap();
        let (png, mime) = prepare(bmp.get_ref()).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(image::load_from_memory(&png).unwrap().to_rgb8(), source);
    }
}
