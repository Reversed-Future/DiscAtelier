use super::{fbx, invalid};
use discatelier_contracts::AppError;
use serde_json::Value;

pub(super) fn collect(format: &str, data: &[u8]) -> Result<Vec<String>, AppError> {
    match format {
        "glb" => glb(data),
        "fbx" => fbx::references(data),
        "obj" => Ok(text(data)?
            .lines()
            .filter_map(|line| {
                line.trim()
                    .strip_prefix("mtllib ")
                    .map(|s| s.trim().to_owned())
            })
            .collect()),
        _ => Err(invalid("不支持此模型格式。")),
    }
}
fn text(data: &[u8]) -> Result<&str, AppError> {
    std::str::from_utf8(data).map_err(|_| invalid("OBJ/MTL 和文本 FBX 必须为 UTF-8 编码。"))
}
pub(super) fn mtl(data: &[u8]) -> Result<Vec<String>, AppError> {
    let mut out = Vec::new();
    for line in text(data)?.lines() {
        let Some((key, value)) = line.trim().split_once(char::is_whitespace) else {
            continue;
        };
        // Exact directives and option arities implemented by the pinned r186 MTLLoader.
        if !matches!(
            key,
            "map_Kd"
                | "map_Ks"
                | "map_Ke"
                | "map_d"
                | "map_bump"
                | "bump"
                | "norm"
                | "disp"
                | "map_kd"
                | "map_ks"
                | "map_ke"
        ) {
            continue;
        }
        let mut words: Vec<&str> = value.split_whitespace().collect();
        for (option, arity) in [("-bm", 1), ("-mm", 2), ("-s", 3), ("-o", 3)] {
            if let Some(i) = words.iter().position(|v| *v == option) {
                if i + arity >= words.len() {
                    return Err(invalid("MTL 贴图参数不完整。"));
                }
                words.drain(i..=i + arity);
            }
        }
        if words.first().is_some_and(|s| s.starts_with('-')) {
            return Err(invalid("MTL 包含当前读取器不支持的贴图选项。"));
        }
        out.push(words.join(" "));
    }
    Ok(out)
}
fn glb(data: &[u8]) -> Result<Vec<String>, AppError> {
    let word = |i| {
        data.get(i..i + 4)
            .and_then(|s| <[u8; 4]>::try_from(s).ok())
            .map(u32::from_le_bytes)
            .ok_or_else(|| invalid("GLB 文件头或分块损坏。"))
    };
    if word(0)? != 0x46546c67
        || word(4)? != 2
        || word(8)? as usize != data.len()
        || word(16)? != 0x4e4f534a
    {
        return Err(invalid("请选择有效的 glTF 2.0 GLB 文件。"));
    }
    let end = 20_usize
        .checked_add(word(12)? as usize)
        .filter(|e| *e <= data.len())
        .ok_or_else(|| invalid("GLB JSON 分块越界。"))?;
    let value: Value =
        serde_json::from_slice(&data[20..end]).map_err(|_| invalid("GLB JSON 分块无效。"))?;
    let mut refs = Vec::new();
    for key in ["buffers", "images"] {
        if let Some(items) = value[key].as_array() {
            for item in items {
                if let Some(uri) = item["uri"].as_str() {
                    if !uri.starts_with("data:") {
                        refs.push(decode_uri(uri)?);
                    }
                }
            }
        }
    }
    Ok(refs)
}
fn decode_uri(s: &str) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    let mut i = 0;
    while i < s.len() {
        if s.as_bytes()[i] == b'%' {
            let hex = s
                .get(i + 1..i + 3)
                .ok_or_else(|| invalid("资源 URI 编码无效。"))?;
            bytes.push(u8::from_str_radix(hex, 16).map_err(|_| invalid("资源 URI 编码无效。"))?);
            i += 3;
        } else {
            bytes.push(s.as_bytes()[i]);
            i += 1;
        }
    }
    String::from_utf8(bytes).map_err(|_| invalid("资源 URI 必须为 UTF-8。"))
}
