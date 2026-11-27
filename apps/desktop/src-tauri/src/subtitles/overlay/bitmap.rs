use super::{error, Appearance};
use discatelier_contracts::AppError;
use std::{mem, ptr};
use windows_sys::{
    core::w,
    Win32::{Foundation::RECT, Graphics::Gdi::*},
};

struct Font(HFONT);
impl Drop for Font {
    fn drop(&mut self) {
        unsafe {
            DeleteObject(self.0);
        }
    }
}

pub(super) struct Bitmap {
    pub dc: HDC,
    bitmap: HBITMAP,
    old: HGDIOBJ,
    pub width: i32,
    pub height: i32,
}
impl Drop for Bitmap {
    fn drop(&mut self) {
        unsafe {
            if !self.bitmap.is_null() {
                SelectObject(self.dc, self.old);
                DeleteObject(self.bitmap);
            }
            DeleteDC(self.dc);
        }
    }
}

impl Bitmap {
    pub fn render(
        lines: &[String],
        style: Appearance,
        dpi: u32,
        available: (i32, i32),
    ) -> Result<Self, AppError> {
        let size = (i32::from(style.font_size) * dpi as i32 / 96).max(1);
        let pad = (size / 3).max(2);
        let limit = (available.0 * 9 / 10 - 2 * pad).max(1);
        let flags = DT_NOPREFIX | DT_WORDBREAK | DT_CENTER;
        unsafe {
            let dc = CreateCompatibleDC(ptr::null_mut());
            if dc.is_null() {
                return Err(error("无法绘制字幕。"));
            }
            let mut surface = Self {
                dc,
                bitmap: ptr::null_mut(),
                old: ptr::null_mut(),
                width: 0,
                height: 0,
            };
            let font = Font(CreateFontW(
                -size,
                0,
                0,
                0,
                FW_NORMAL as i32,
                0,
                0,
                0,
                DEFAULT_CHARSET.into(),
                0,
                0,
                ANTIALIASED_QUALITY.into(),
                0,
                w!("Microsoft YaHei UI"),
            ));
            if font.0.is_null() {
                return Err(error("无法创建字幕字体。"));
            }
            let original_font = SelectObject(dc, font.0);
            let rows: Vec<_> = lines
                .iter()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .map(|line| {
                    let text: Vec<u16> = line.encode_utf16().collect();
                    let mut rect = RECT {
                        left: 0,
                        right: limit,
                        top: 0,
                        bottom: 0,
                    };
                    DrawTextW(
                        dc,
                        text.as_ptr(),
                        text.len() as i32,
                        &mut rect,
                        flags | DT_CALCRECT,
                    );
                    (text, rect.right - rect.left, rect.bottom)
                })
                .collect();
            let width = (rows.iter().map(|r| r.1).max().unwrap_or(0).min(limit) + 2 * pad)
                .min(available.0)
                .max(1);
            let height = (rows.iter().map(|r| r.2).sum::<i32>() + 2 * pad)
                .min(available.1)
                .max(1);
            surface.width = width;
            surface.height = height;
            let mut info: BITMAPINFO = mem::zeroed();
            info.bmiHeader.biSize = mem::size_of::<BITMAPINFOHEADER>() as u32;
            info.bmiHeader.biWidth = width;
            info.bmiHeader.biHeight = -height;
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            let mut bits = ptr::null_mut();
            surface.bitmap =
                CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut bits, ptr::null_mut(), 0);
            if surface.bitmap.is_null() {
                SelectObject(dc, original_font);
                return Err(error("无法创建字幕画面。"));
            }
            surface.old = SelectObject(dc, surface.bitmap);
            let pixels =
                std::slice::from_raw_parts_mut(bits as *mut u32, width as usize * height as usize);
            pixels.fill(0);
            SetBkMode(dc, TRANSPARENT as i32);
            SetTextColor(dc, 0xffffff);
            let mut y = pad;
            for (text, _, row_height) in rows {
                let mut rect = RECT {
                    left: pad,
                    right: width - pad,
                    top: y,
                    bottom: y + row_height,
                };
                DrawTextW(dc, text.as_ptr(), text.len() as i32, &mut rect, flags);
                y += row_height;
            }
            GdiFlush();
            SelectObject(dc, original_font);
            // GDI produces a grayscale glyph mask. Composite it over the independently
            // adjustable black backing and a one-pixel shadow, in premultiplied BGRA.
            let background = u32::from(style.background_opacity) * 255 / 100;
            for i in (0..pixels.len()).rev() {
                let ink = pixels[i] & 255;
                let shadow = if i > width as usize && i % width as usize != 0 {
                    pixels[i - width as usize - 1] & 255
                } else {
                    0
                };
                let backing = background + (255 - background) * shadow / 255;
                let alpha = ink + (255 - ink) * backing / 255;
                pixels[i] = (alpha << 24) | ink * 0x010101;
            }
            Ok(surface)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_caption_uses_one_row_and_translation_gets_its_own_row() {
        let render = |rows: &[String]| Bitmap::render(rows, Appearance::default(), 96, (960, 600)).unwrap();
        let single = render(&["下雨了".into()]);
        let trimmed = render(&["\n下雨了\r\n".into(), " \n ".into()]);
        assert_eq!((trimmed.width, trimmed.height), (single.width, single.height));
        let bilingual = render(&["下雨了".into(), "Rain".into()]);
        assert!(bilingual.height > single.height);
        let long = render(&["经常下雨".repeat(40)]);
        assert!(long.height > single.height);
    }

    #[test]
    fn caption_pixels_preserve_white_text_at_each_background_opacity() {
        for opacity in [0, 50, 100] {
            let appearance = Appearance {
                background_opacity: opacity,
                ..Default::default()
            };
            let frame = Bitmap::render(
                &["日本語 English 简体中文".into()],
                appearance,
                96,
                (960, 600),
            )
            .unwrap();
            unsafe {
                let mut dib: DIBSECTION = mem::zeroed();
                assert_ne!(
                    GetObjectW(
                        frame.bitmap,
                        mem::size_of::<DIBSECTION>() as i32,
                        &mut dib as *mut _ as _
                    ),
                    0
                );
                let pixels = std::slice::from_raw_parts(
                    dib.dsBm.bmBits as *const u32,
                    (frame.width * frame.height) as usize,
                );
                assert_eq!(pixels[0], (u32::from(opacity) * 255 / 100) << 24);
                assert!(pixels.iter().any(|pixel| *pixel == 0xffffffff));
                assert!(pixels.iter().all(|pixel| pixel & 255 <= pixel >> 24));
            }
        }
    }
}
