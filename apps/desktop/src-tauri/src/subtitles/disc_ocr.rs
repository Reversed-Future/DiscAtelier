use super::error;
use discatelier_contracts::AppError;
use image::{
    imageops::{resize, FilterType},
    GrayImage,
};
use windows::{
    core::HSTRING,
    Globalization::Language,
    Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap},
    Media::Ocr::OcrEngine,
    Security::Cryptography::CryptographicBuffer,
};

// Slanted glyphs on authored PGS tracks can fuse neighboring characters in OCR.
// Compare vertical ink edges before straightening a single horizontal line.
fn prepare(w: i32, h: i32, data: &[u8]) -> Result<GrayImage, AppError> {
    let image = GrayImage::from_raw(w as u32, h as u32, data.to_vec())
        .ok_or_else(|| error("字幕图形尺寸无效。"))?;
    if h > 128 || w < h * 2 || h < 12 || w > 3800 {
        return Ok(image);
    }
    let scaled = if h > 44 {
        resize(
            &image,
            ((w as f64 * 44.0 / h as f64).round() as u32).max(1),
            44,
            FilterType::Lanczos3,
        )
    } else {
        image
    };
    let (width, height) = (scaled.width() as usize, scaled.height() as usize);
    let out_width = width + height + 24;
    let pad = height / 2 + 12;
    let offset = |slope: i32, y: usize| (pad as i32 + (slope * y as i32) / 100) as usize;
    let score = |slope: i32| {
        let mut ink = vec![0i32; out_width];
        for (y, row) in scaled.as_raw().chunks_exact(width).enumerate() {
            let shift = offset(slope, y);
            for (x, &value) in row.iter().enumerate() {
                if value < 160 {
                    ink[x + shift] += 1;
                }
            }
        }
        ink.windows(2)
            .map(|pair| (pair[1] - pair[0]).pow(2) as i64)
            .sum::<i64>()
    };
    let baseline = score(0);
    let mut best = (baseline, 0);
    for slope in [-40, -32, -24, -16, -8, 8, 16, 24, 32, 40] {
        let edges = score(slope);
        if edges > best.0 {
            best = (edges, slope);
        }
    }
    let slope = if best.0 * 4 > baseline * 5 { best.1.clamp(-28, 28) } else { 0 };
    let mut pixels = vec![255; out_width * (height + 24)];
    for (y, row) in scaled.as_raw().chunks_exact(width).enumerate() {
        let begin = (y + 12) * out_width + offset(slope, y);
        pixels[begin..begin + width].copy_from_slice(row);
    }
    GrayImage::from_raw(out_width as u32, (height + 24) as u32, pixels)
        .ok_or_else(|| error("无法处理字幕图形。"))
}

// OCR line boxes describe the source bitmap. Reflow their text to the player's
// available width while keeping original and translation in separate overlay rows.
fn join_ocr_lines(lines: &[String], cjk: bool) -> String {
    let mut joined = String::new();
    for part in lines.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let previous = joined.chars().next_back();
        let next = part.chars().next().unwrap();
        let latin_boundary = previous.is_some_and(|ch| ch.is_ascii_alphanumeric()) && next.is_ascii_alphanumeric();
        let punctuation = ".,?!:;，。！？、：；…）】」』".contains(next);
        if previous.is_some() && !punctuation && (!cjk || latin_boundary) {
            joined.push(' ');
        }
        joined.push_str(part);
    }
    joined
}

pub(super) fn recognize_bitmap(
    language: &str,
    w: i32,
    h: i32,
    data: &[u8],
) -> Result<String, AppError> {
    let lang = Language::CreateLanguage(&HSTRING::from(language))
        .map_err(|_| error("请选择与字幕轨一致的 OCR 语言。"))?;
    let engine = OcrEngine::TryCreateFromLanguage(&lang)
        .map_err(|_| error("请在 Windows 语言设置中安装该语言的文字识别组件，或选用原盘样式。"))?;
    let image = prepare(w, h, data)?;
    let cjk = matches!(language.split('-').next(), Some("zh" | "ja"));
    let recognize = || -> windows::core::Result<String> {
        let buf = CryptographicBuffer::CreateFromByteArray(image.as_raw())?;
        let bmp = SoftwareBitmap::CreateCopyFromBuffer(
            &buf,
            BitmapPixelFormat::Gray8,
            image.width() as i32,
            image.height() as i32,
        )?;
        let result = engine.RecognizeAsync(&bmp)?.join()?;
        let mut lines = Vec::new();
        for line in result.Lines()? {
            if !cjk {
                lines.push(line.Text()?.to_string());
                continue;
            }
            let mut text = String::new();
            let mut right = None;
            for word in line.Words()? {
                let rect = word.BoundingRect()?;
                let token = word.Text()?.to_string();
                let latin_boundary = text.ends_with(|c: char| c.is_ascii_alphanumeric())
                    && token.starts_with(|c: char| c.is_ascii_alphanumeric());
                if right.is_some_and(|x: f32| rect.X - x > rect.Height * 0.42 || latin_boundary) {
                    text.push(' ');
                }
                text.push_str(&token);
                right = Some(rect.X + rect.Width);
            }
            lines.push(text);
        }
        Ok(join_ocr_lines(&lines, cjk))
    };
    let text = recognize().map_err(|e| error(format!("原盘字幕识别失败：{e}")))?;
    if text.trim().is_empty() {
        return Err(error("这条图形字幕未识别出文字，已恢复原盘样式。"));
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::join_ocr_lines;
    #[test]
    fn short_ocr_fragments_flow_as_one_caption() {
        assert_eq!(join_ocr_lines(&["外".into(), " 面 ".into(), "".into(), "下雨了。".into()], true), "外面下雨了。");
        assert_eq!(join_ocr_lines(&["Open".into(), "the window".into(), ".".into()], false), "Open the window.");
        assert_eq!(join_ocr_lines(&["Blu".into(), "Ray".into()], true), "Blu Ray");
    }
}
