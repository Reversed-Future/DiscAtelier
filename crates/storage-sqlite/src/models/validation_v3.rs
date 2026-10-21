//! V3 fixed assembly contract, from AtelierPublisher shared/model-v3.js.
use super::{image, invalid, label, table};
use discatelier_contracts::AppError;
use serde_json::Value;
use std::sync::OnceLock;

fn profiles() -> &'static Value {
    static PROFILES: OnceLock<Value> = OnceLock::new();
    PROFILES.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../packages/atelier-model-runtime/shared/assembly-profiles.json"
        ))
        .expect("embedded assembly profiles")
    })
}
fn numeric(value: &Value) -> bool {
    value.as_f64().is_some_and(f64::is_finite)
}
fn vector(value: &Value, length: usize) -> bool {
    value
        .as_array()
        .is_some_and(|values| values.len() == length && values.iter().all(numeric))
}
fn data_budget(value: &Value, count: &mut usize, depth: usize) -> Result<(), AppError> {
    *count += 1;
    if *count > 100_000 || depth > 16 {
        return Err(invalid("模型装配数据过大。"));
    }
    match value {
        Value::Number(n) if !n.as_f64().is_some_and(|n| n.is_finite() && n.abs() <= 1e7) => {
            return Err(invalid("模型装配数值无效。"))
        }
        Value::String(s) if s.encode_utf16().count() > 2048 => {
            return Err(invalid("模型装配文字过长。"))
        }
        Value::Array(values) => {
            if values.len() > 10_000 {
                return Err(invalid("模型装配数组过大。"));
            }
            for item in values {
                data_budget(item, count, depth + 1)?;
            }
        }
        Value::Object(values) => {
            for (key, item) in values {
                if key.encode_utf16().count() > 160
                    || matches!(key.as_str(), "__proto__" | "constructor" | "prototype")
                {
                    return Err(invalid("模型装配字段无效。"));
                }
                data_budget(item, count, depth + 1)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub(super) fn validate(value: &Value, pixels: &mut u64) -> Result<(), AppError> {
    let profile = value["profile"]
        .as_str()
        .and_then(|id| profiles().get(id))
        .ok_or_else(|| invalid("不支持的模型装配结构。"))?;
    if value["rig"] != "album-assembly-v1" || value["runtimeVersion"] != 1 {
        return Err(invalid("不支持的模型装配运行版本。"));
    }
    let images = table(&value["images"], 100)?;
    if images.is_empty() {
        return Err(invalid("模型缺少内置图片。"));
    }
    for row in images.values() {
        image(&row["image"], pixels)?;
    }
    let textures = table(&value["textures"], 100)?;
    let expected = profile["textures"].as_array().unwrap();
    if textures.len() != expected.len()
        || expected
            .iter()
            .any(|id| !textures.contains_key(id.as_str().unwrap()))
    {
        return Err(invalid("模型贴图与装配结构不符。"));
    }
    for row in textures.values() {
        if !images.contains_key(label(&row["image"], 160)?) {
            return Err(invalid("模型贴图引用无效。"));
        }
    }
    let data = value["data"]
        .as_object()
        .ok_or_else(|| invalid("模型装配数据缺失。"))?;
    let keys = profile["data"].as_array().unwrap();
    if data.len() != keys.len()
        || keys
            .iter()
            .any(|key| !data.contains_key(key.as_str().unwrap()))
    {
        return Err(invalid("模型装配数据与结构不符。"));
    }
    data_budget(&value["data"], &mut 0, 0)?;
    if let Some(boundaries) = data.get("boundaries") {
        for (key, boundary) in boundaries
            .as_object()
            .ok_or_else(|| invalid("模型纸边数据无效。"))?
        {
            if !textures.contains_key(key.as_str())
                || !boundary.is_object()
                || !vector(&boundary["homography"], 9)
                || !vector(&boundary["edgeOffsets"], 2)
                || boundary.get("centerOffset").is_some_and(|v| !vector(v, 2))
            {
                return Err(invalid("模型纸边投影无效。"));
            }
            for field in ["edgeProfile", "sideProfile"] {
                if boundary.get(field).is_some_and(|v| {
                    !v.as_array().is_some_and(|points| {
                        points.len() == 17 && points.iter().all(|p| vector(p, 2))
                    })
                }) {
                    return Err(invalid("模型纸边曲线无效。"));
                }
            }
        }
    }
    if data.get("holePoints").is_some_and(|v| {
        !v.as_array().is_some_and(|points| {
            (3..=1000).contains(&points.len()) && points.iter().all(|p| vector(p, 2))
        })
    }) {
        return Err(invalid("模型挂孔轮廓无效。"));
    }
    if data.get("holes").is_some_and(|v| {
        !v.as_array().is_some_and(|holes| {
            holes.len() == 15
                && holes.iter().all(|h| {
                    ["x", "y", "w", "h"].iter().all(|key| numeric(&h[*key]))
                        && h["w"].as_f64().unwrap() > 0.0
                        && h["h"].as_f64().unwrap() > 0.0
                })
        })
    }) {
        return Err(invalid("模型解密孔数据无效。"));
    }
    if let Some(rows) = data.get("decodeText") {
        for row in rows
            .as_array()
            .ok_or_else(|| invalid("模型解密文字无效。"))?
        {
            label(&row["card"], 160)?;
            for word in row["words"]
                .as_array()
                .ok_or_else(|| invalid("模型解密文字无效。"))?
            {
                label(word, 100)?;
            }
        }
    }
    if let Some(calibration) = data.get("calibration") {
        for row in calibration["registrations"]
            .as_array()
            .ok_or_else(|| invalid("模型解密配准无效。"))?
        {
            label(&row["card"], 160)?;
            if row.get("placement").is_some_and(|p| {
                !p.is_object() || ["x", "y", "angle"].iter().any(|key| !numeric(&p[*key]))
            }) {
                return Err(invalid("模型解密位置无效。"));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use serde_json::json;
    fn fixture(profile: &str) -> Value {
        let cover = format!(
            "data:image/png;base64,{}",
            STANDARD.encode(include_bytes!(
                "../../../../apps/desktop/src-tauri/icons/32x32.png"
            ))
        );
        let values = json!({"boundaries":{},"holePoints":[[0,0],[1,0],[0,1]],"holes":vec![json!({"x":0,"y":0,"w":1,"h":1});15],"decodeText":[],"calibration":{"registrations":[]}});
        let data: serde_json::Map<String, Value> = profiles()[profile]["data"]
            .as_array()
            .unwrap()
            .iter()
            .map(|key| {
                (
                    key.as_str().unwrap().to_owned(),
                    values[key.as_str().unwrap()].clone(),
                )
            })
            .collect();
        let textures: Vec<Value> = profiles()[profile]["textures"]
            .as_array()
            .unwrap()
            .iter()
            .map(|id| json!({"id":id,"image":"image"}))
            .collect();
        json!({"format":"atelier-interactive-model","version":3,"id":"test","title":"Test","creator":"Test","cover":cover,"rig":"album-assembly-v1","runtimeVersion":1,"profile":profile,"images":[{"id":"image","image":cover}],"textures":textures,"data":data})
    }
    #[test]
    fn all_six_v3_profiles_accept_embedded_resources() {
        for id in profiles().as_object().unwrap().keys() {
            assert!(
                super::super::validate(&fixture(id).to_string()).is_ok(),
                "{id}"
            );
        }
    }
    #[test]
    fn invalid_contracts_and_resources_are_rejected() {
        for (pointer, replacement) in [
            ("/profile", json!("constructor")),
            ("/rig", json!("other")),
            ("/runtimeVersion", json!(2)),
            ("/images/0/image", json!("https://example.com/image.png")),
            ("/textures/0/image", json!("missing")),
            ("/data/holePoints", json!([[0, 0]])),
            ("/data/boundaries", json!({"missing":{}})),
        ] {
            let mut value = fixture("thunder-radio-luoyan");
            *value.pointer_mut(pointer).unwrap() = replacement;
            assert!(
                super::super::validate(&value.to_string()).is_err(),
                "{pointer}"
            );
        }
        let mut value = fixture("research-bai");
        value["data"]["holes"][0]["w"] = json!(0);
        assert!(super::super::validate(&value.to_string()).is_err());
        let mut value = fixture("nafelibeta2");
        value["data"]["unexpected"] = json!(true);
        assert!(super::super::validate(&value.to_string()).is_err());
    }
    #[test]
    #[ignore = "Explicit read-only check of authored packages; set DISCATELIER_MODEL_PACKAGES"]
    fn validate_authored_v3_packages() {
        let directory =
            std::path::PathBuf::from(std::env::var("DISCATELIER_MODEL_PACKAGES").unwrap());
        for id in profiles().as_object().unwrap().keys() {
            let path = directory.join(format!("{id}.ateliermodel"));
            let text = std::fs::read_to_string(path).unwrap();
            let metadata = super::super::validate(&text)
                .unwrap_or_else(|error| panic!("{id}: {}", error.message));
            assert!(!metadata.preview.is_empty());
            println!("Validated V3 {id}: {} bytes", text.len());
        }
    }
}
