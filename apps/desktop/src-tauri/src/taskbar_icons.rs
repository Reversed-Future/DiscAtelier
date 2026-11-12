//! Generates the small monochrome taskbar-button icons from Segoe MDL2 glyphs.
use windows::{
    core::{w, BOOL},
    Win32::{
        Foundation::{COLORREF, HWND},
        Graphics::Gdi::{
            CreateBitmap, CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC, DeleteObject, GetTextExtentPoint32W,
            SelectObject, SetBkMode, SetTextColor, TextOutW, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CLEARTYPE_QUALITY,
            CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DIB_RGB_COLORS, FF_DONTCARE, HDC, HGDIOBJ, OUT_DEFAULT_PRECIS,
            TRANSPARENT,
        },
        UI::WindowsAndMessaging::{CreateIconIndirect, DestroyIcon, HICON, ICONINFO},
    },
};

const SIZE: i32 = 32;
const GLYPHS: [(char, &str); 4] = [
    ('\u{E892}', "上一首"),
    ('\u{E768}', "播放"),
    ('\u{E769}', "暂停"),
    ('\u{E893}', "下一首"),
];

unsafe fn icon(glyph: char) -> windows::core::Result<HICON> {
    let mem = CreateCompatibleDC(None);
    if mem.is_invalid() {
        return Err(windows::core::Error::from_thread());
    }
    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: SIZE,
        biHeight: -SIZE,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut bits = std::ptr::null_mut();
    let color = CreateDIBSection(Some(mem), &info, DIB_RGB_COLORS, &mut bits, None, 0)?;
    let old = SelectObject(mem, color.into());
    let _ = SetBkMode(mem, TRANSPARENT);
    let _ = SetTextColor(mem, COLORREF(0x00FF_FFFF));
    let font = CreateFontW(
        -26, 0, 0, 0, 400, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
        CLEARTYPE_QUALITY, FF_DONTCARE.0 as u32, w!("Segoe MDL2 Assets"),
    );
    let old_font = SelectObject(mem, font.into());
    let text = [glyph as u16];
    let mut extent = Default::default();
    let _ = GetTextExtentPoint32W(mem, &text, &mut extent);
    let x = (SIZE - extent.cx) / 2;
    let y = (SIZE - extent.cy) / 2;
    let _ = TextOutW(mem, x, y, &text);

    if !bits.is_null() {
        let pixels = std::slice::from_raw_parts_mut(bits as *mut u8, (SIZE * SIZE * 4) as usize);
        for pixel in pixels.chunks_exact_mut(4) {
            // White glyph over black. Store straight alpha; Windows composites it.
            let alpha = pixel[0].max(pixel[1]).max(pixel[2]);
            pixel[0] = alpha;
            pixel[1] = alpha;
            pixel[2] = alpha;
            pixel[3] = alpha;
        }
    }

    SelectObject(mem, old_font);
    let _ = DeleteObject(font.into());
    SelectObject(mem, old);
    let _ = DeleteDC(mem);
    let mask = CreateBitmap(SIZE, SIZE, 1, 1, None);
    if mask.is_invalid() {
        let _ = DeleteObject(color.into());
        return Err(windows::core::Error::from_thread());
    }
    let icon = CreateIconIndirect(&ICONINFO {
        fIcon: BOOL(1),
        hbmMask: mask,
        hbmColor: color,
        xHotspot: 0,
        yHotspot: 0,
    });
    let _ = DeleteObject(mask.into());
    let _ = DeleteObject(color.into());
    icon
}

pub struct Icons {
    pub previous: HICON,
    pub play: HICON,
    pub pause: HICON,
    pub next: HICON,
}

impl Icons {
    pub fn create() -> windows::core::Result<Self> {
        Ok(Self {
            previous: unsafe { icon(GLYPHS[0].0)? },
            play: unsafe { icon(GLYPHS[1].0)? },
            pause: unsafe { icon(GLYPHS[2].0)? },
            next: unsafe { icon(GLYPHS[3].0)? },
        })
    }
    pub fn destroy(&self) {
        for icon in [self.previous, self.play, self.pause, self.next] {
            let _ = unsafe { DestroyIcon(icon) };
        }
    }
}

#[allow(dead_code)]
fn _assert_types(_: HDC, _: HWND, _: HGDIOBJ) {}
