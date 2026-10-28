//! Bounded reference reader, not a second FBX geometry importer.
use super::invalid;
use discatelier_contracts::AppError;
#[derive(Default)]
struct Video {
    relative: String,
    filename: String,
    embedded: bool,
}
impl Video {
    fn finish(self, out: &mut Vec<String>) {
        if !self.embedded {
            let name = if self.relative.is_empty() {
                self.filename
            } else {
                self.relative
            };
            if !name.is_empty() {
                out.push(name);
            }
        }
    }
}
pub(super) fn references(data: &[u8]) -> Result<Vec<String>, AppError> {
    if data.starts_with(b"Kaydara FBX Binary  \0\x1a\0") {
        let mut reader = Reader {
            data,
            offset: 23,
            wide: false,
            nodes: 0,
            array_bytes: 0,
        };
        let version = reader.uint(4)?;
        if version < 6400 {
            return Err(invalid("此 FBX 二进制版本过旧。"));
        }
        reader.wide = version >= 7500;
        let mut out = Vec::new();
        while reader.offset + if reader.wide { 25 } else { 13 } <= data.len() {
            if !reader.node(0, &mut None, &mut out)? {
                break;
            }
        }
        Ok(out)
    } else {
        ascii(data)
    }
}
struct Reader<'a> {
    data: &'a [u8],
    offset: usize,
    wide: bool,
    nodes: usize,
    array_bytes: usize,
}
impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], AppError> {
        let end = self
            .offset
            .checked_add(n)
            .filter(|v| *v <= self.data.len())
            .ok_or_else(|| invalid("FBX 数据越界或已截断。"))?;
        let bytes = &self.data[self.offset..end];
        self.offset = end;
        Ok(bytes)
    }
    fn uint(&mut self, n: usize) -> Result<usize, AppError> {
        let mut value = [0_u8; 8];
        value[..n].copy_from_slice(self.take(n)?);
        usize::try_from(u64::from_le_bytes(value)).map_err(|_| invalid("FBX 数值越界。"))
    }
    fn node(
        &mut self,
        depth: usize,
        video: &mut Option<Video>,
        out: &mut Vec<String>,
    ) -> Result<bool, AppError> {
        self.nodes += 1;
        if depth > 64 || self.nodes > 200_000 {
            return Err(invalid("FBX 层级或节点数量过大。"));
        }
        let width = if self.wide { 8 } else { 4 };
        let end = self.uint(width)?;
        let count = self.uint(width)?;
        let size = self.uint(width)?;
        let name_len = self.uint(1)?;
        let name =
            std::str::from_utf8(self.take(name_len)?).map_err(|_| invalid("FBX 节点名称无效。"))?;
        if end == 0 {
            return Ok(false);
        }
        if end < self.offset || end > self.data.len() || count > 1_000_000 {
            return Err(invalid("FBX 节点边界无效。"));
        }
        let prop_end = self
            .offset
            .checked_add(size)
            .filter(|e| *e <= end)
            .ok_or_else(|| invalid("FBX 属性越界。"))?;
        let mut own_video = if name == "Video" {
            Some(Video::default())
        } else {
            None
        };
        let target = if name == "Video" {
            &mut own_video
        } else {
            video
        };
        for _ in 0..count {
            let kind = self.uint(1)? as u8;
            match kind {
                b'C' => {
                    self.take(1)?;
                }
                b'Y' => {
                    self.take(2)?;
                }
                b'F' | b'I' => {
                    self.take(4)?;
                }
                b'D' | b'L' => {
                    self.take(8)?;
                }
                b'S' | b'R' => {
                    let n = self.uint(4)?;
                    let bytes = self.take(n)?;
                    if let Some(v) = target.as_mut() {
                        match name {
                            "Content" => v.embedded |= !bytes.is_empty(),
                            "RelativeFilename" | "Filename" if kind == b'S' => {
                                let value = std::str::from_utf8(bytes)
                                    .map_err(|_| invalid("FBX 贴图路径不是 UTF-8。"))?
                                    .trim_end_matches('\0')
                                    .to_owned();
                                if name == "RelativeFilename" {
                                    v.relative = value;
                                } else {
                                    v.filename = value;
                                }
                            }
                            _ => {}
                        }
                    }
                }
                b'b' | b'c' | b'd' | b'f' | b'i' | b'l' => {
                    let n = self.uint(4)?;
                    let encoding = self.uint(4)?;
                    let packed = self.uint(4)?;
                    let stride = match kind {
                        b'd' | b'l' => 8,
                        b'f' | b'i' => 4,
                        _ => 1,
                    };
                    let bytes = n
                        .checked_mul(stride)
                        .ok_or_else(|| invalid("FBX 数组过大。"))?;
                    self.array_bytes = self.array_bytes.saturating_add(bytes);
                    if self.array_bytes > 128 * 1024 * 1024 || encoding > 1 {
                        return Err(invalid("FBX 展开数组超过 128 MiB 或编码无效。"));
                    }
                    self.take(if encoding == 0 { bytes } else { packed })?;
                }
                _ => return Err(invalid("FBX 属性类型不受支持。")),
            }
        }
        if self.offset != prop_end {
            return Err(invalid("FBX 属性长度不一致。"));
        }
        while self.offset < end {
            self.node(depth + 1, target, out)?;
        }
        if self.offset != end {
            return Err(invalid("FBX 节点长度不一致。"));
        }
        if let Some(v) = own_video {
            v.finish(out);
        }
        Ok(true)
    }
}
fn ascii(data: &[u8]) -> Result<Vec<String>, AppError> {
    let text = std::str::from_utf8(data).map_err(|_| invalid("FBX 文件头无效。"))?;
    if !text.contains("FBXVersion:") {
        return Err(invalid("不是有效的 FBX 文件。"));
    }
    let mut out = Vec::new();
    let mut video: Option<Video> = None;
    let mut depth = 0_i32;
    let mut start = 0;
    let mut content_next = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with(';') {
            continue;
        }
        if line.starts_with("Video:") {
            video = Some(Video::default());
            start = depth;
        }
        if let Some(v) = video.as_mut() {
            for key in ["RelativeFilename:", "Filename:"] {
                if let Some(value) = line.strip_prefix(key) {
                    let value = value.trim().trim_matches('"').to_owned();
                    if key == "RelativeFilename:" {
                        v.relative = value;
                    } else {
                        v.filename = value;
                    }
                }
            }
            if content_next {
                v.embedded = line.trim_matches(['"', ',', ' ']).len() > 4;
                content_next = false;
            }
            if let Some(value) = line.strip_prefix("Content:") {
                let value = value.trim().trim_matches(['"', ',', ' ']);
                v.embedded = !value.is_empty();
                content_next = !v.embedded;
            }
        }
        // FBX quoted strings may contain braces; count only structural braces.
        let mut quoted = false;
        for ch in line.chars() {
            if ch == '"' {
                quoted = !quoted;
            } else if !quoted {
                if ch == '{' {
                    depth += 1;
                } else if ch == '}' {
                    depth -= 1;
                }
            }
        }
        if !(0..=64).contains(&depth) {
            return Err(invalid("FBX 文本层级无效。"));
        }
        if video.is_some() && depth == start {
            video.take().unwrap().finish(&mut out);
            content_next = false;
        }
    }
    if depth != 0 {
        return Err(invalid("FBX 文本被截断。"));
    }
    Ok(out)
}
