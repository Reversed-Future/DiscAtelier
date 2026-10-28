//! Native storage boundary: bounded package, embedded images and referential integrity.
//! Full upstream validation additionally runs in a worker before rendering.
#[path = "validation_v3.rs"]
mod v3;
#[path = "validation_v4.rs"]
mod v4;
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::AppError;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io::Cursor,
};

pub struct Metadata {
    pub title: String,
    pub preview: String,
}
fn invalid(message: &str) -> AppError {
    AppError::new("model", message)
}
// Largest verified authored package: 176,601,152 pixels including its preview.
const MAX_MODEL_PIXELS: u64 = 192 * 1024 * 1024;
fn add_pixels(pixels: &mut u64, width: u32, height: u32) -> Result<(), AppError> {
    *pixels += u64::from(width) * u64::from(height);
    if *pixels > MAX_MODEL_PIXELS {
        return Err(invalid(
            "模型贴图总尺寸过大，请在 AtelierPublisher 中优化贴图。",
        ));
    }
    Ok(())
}
pub(super) fn label(value: &Value, max: usize) -> Result<&str, AppError> {
    value
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.chars().count() <= max && !s.contains('\0'))
        .ok_or_else(|| invalid("模型编号、标题或引用无效。"))
}
fn table(value: &Value, max: usize) -> Result<HashMap<&str, &Value>, AppError> {
    let list = value
        .as_array()
        .filter(|v| v.len() <= max)
        .ok_or_else(|| invalid("模型表结构或数量无效。"))?;
    let mut map = HashMap::new();
    for item in list {
        if map.insert(label(&item["id"], 160)?, item).is_some() {
            return Err(invalid("模型编号重复。"));
        }
    }
    Ok(map)
}
pub(super) fn image(value: &Value, pixels: &mut u64) -> Result<(), AppError> {
    let _image = crate::profiling::Span::new("model.image_decode");
    let text = value
        .as_str()
        .filter(|s| s.len() <= 16 * 1024 * 1024)
        .ok_or_else(|| invalid("模型图片过大。"))?;
    let (data, format) = if let Some(data) = text.strip_prefix("data:image/png;base64,") {
        (data, image::ImageFormat::Png)
    } else if let Some(data) = text.strip_prefix("data:image/webp;base64,") {
        (data, image::ImageFormat::WebP)
    } else {
        return Err(invalid("模型图片必须内置 PNG 或 WebP。"));
    };
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| invalid("模型图片编码无效。"))?;
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|_| invalid("模型图片损坏或尺寸过大。"))?;
    add_pixels(pixels, decoded.width(), decoded.height())
}

fn references(value: &Value, nodes: &HashMap<&str, &Value>) -> Result<(), AppError> {
    if value.is_null() {
        return Ok(());
    }
    for id in value
        .as_array()
        .ok_or_else(|| invalid("模型部件引用无效。"))?
    {
        if !nodes.contains_key(label(id, 160)?) {
            return Err(invalid("模型引用了不存在的部件。"));
        }
    }
    Ok(())
}
pub fn validate(text: &str) -> Result<Metadata, AppError> {
    if text.len() > super::source::TEXT_LIMIT {
        return Err(invalid("模型文件不能超过 50 MiB。"));
    }
    let value: Value = crate::profiling::measure("model.parse_json", || serde_json::from_str(text))
        .map_err(|_| invalid("模型文件不是有效的 JSON。"))?;
    if value["format"] == "discatelier-source-model" {
        return super::source::validate(&value);
    }
    if text.len() > 50 * 1024 * 1024 {
        return Err(invalid("模型文件不能超过 50 MiB。"));
    }
    if value["format"] != "atelier-interactive-model"
        || !matches!(value["version"].as_u64(), Some(2..=4))
    {
        return Err(invalid(
            "请使用 AtelierPublisher 导出的 v2、v3 或 v4 .ateliermodel 文件。",
        ));
    }
    label(&value["id"], 100)?;
    let title = label(&value["title"], 300)?.to_owned();
    label(&value["creator"], 600)?;
    let mut pixels = 0;
    image(&value["cover"], &mut pixels)?;
    if value["version"] == 3 {
        v3::validate(&value, &mut pixels)?;
        return Ok(Metadata {
            title,
            preview: value["cover"].as_str().unwrap().to_owned(),
        });
    }
    let scene = &value["scene"];
    if scene["up"] != "Z" {
        return Err(invalid("模型坐标系无效。"));
    }
    let nodes = table(&scene["nodes"], 3000)?;
    let geometries = table(&scene["geometries"], 3000)?;
    let materials = table(&scene["materials"], 500)?;
    let textures = table(&scene["textures"], 300)?;
    if nodes.is_empty() {
        return Err(invalid("模型场景为空。"));
    }
    for texture in textures.values() {
        image(&texture["image"], &mut pixels)?;
    }
    for material in materials.values() {
        if !matches!(
            material["type"].as_str(),
            Some("standard" | "physical" | "basic")
        ) {
            return Err(invalid("不支持的模型材质。"));
        }
        if let Some(maps) = material["maps"].as_object() {
            for reference in maps.values() {
                if !textures.contains_key(label(reference, 160)?) {
                    return Err(invalid("模型贴图引用无效。"));
                }
            }
        }
    }
    for (id, node) in &nodes {
        let mut visited = HashSet::from([*id]);
        let mut parent = &node["parent"];
        while !parent.is_null() {
            let key = label(parent, 160)?;
            if !visited.insert(key) {
                return Err(invalid("模型部件层级存在循环。"));
            }
            parent = &nodes
                .get(key)
                .ok_or_else(|| invalid("模型父部件不存在。"))?["parent"];
        }
        if !node["mesh"].is_null() {
            if !geometries.contains_key(label(&node["mesh"]["geometry"], 160)?) {
                return Err(invalid("模型几何体引用无效。"));
            }
            references(&node["mesh"]["materials"], &materials)?;
        }
    }
    validate_graph(&value, &nodes, 768, 4000)?;
    if value["version"] == 4 {
        v4::validate(&value, &nodes)?;
    }
    Ok(Metadata {
        title,
        preview: value["cover"].as_str().unwrap().to_owned(),
    })
}

fn validate_graph(
    value: &Value,
    nodes: &HashMap<&str, &Value>,
    max_states: usize,
    max_actions: usize,
) -> Result<(), AppError> {
    let states = table(&value["states"], max_states)?;
    let actions = table(&value["actions"], max_actions)?;
    if !states.contains_key(label(&value["initialState"], 160)?) {
        return Err(invalid("模型初始状态不存在。"));
    }
    for state in states.values() {
        for field in ["focus", "inspect", "view"] {
            references(&state[field], nodes)?;
        }
        let clicks = state["clicks"]
            .as_array()
            .ok_or_else(|| invalid("模型交互列表无效。"))?;
        for click in clicks {
            if !nodes.contains_key(label(&click["target"], 160)?)
                || !actions.contains_key(label(&click["action"], 160)?)
            {
                return Err(invalid("模型交互引用无效。"));
            }
        }
    }
    for action in actions.values() {
        for field in ["from", "to"] {
            if !states.contains_key(label(&action[field], 160)?) {
                return Err(invalid("模型动作状态无效。"));
            }
        }
        if !action["duration"]
            .as_f64()
            .is_some_and(|n| (1.0..=120000.0).contains(&n))
        {
            return Err(invalid("模型动画时长无效。"));
        }
        references(&action["focus"], nodes)?;
        references(&action["view"], nodes)?;
    }
    Ok(())
}

#[cfg(test)]
mod pixel_budget_tests {
    use super::add_pixels;
    #[test]
    fn complete_authored_package_fits_but_budget_remains_bounded() {
        let mut pixels = 176_601_152;
        assert!(add_pixels(&mut pixels, 1, 1).is_ok());
        let mut boundary = 192 * 1024 * 1024 - 1;
        assert!(add_pixels(&mut boundary, 1, 1).is_ok());
        assert!(add_pixels(&mut boundary, 1, 1).is_err());
    }
}
