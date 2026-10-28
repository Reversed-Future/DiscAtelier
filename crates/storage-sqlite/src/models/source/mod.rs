//! Original-format assets. The envelope stores bytes, not converted geometry.
mod fbx;
mod references;
mod resources;
#[cfg(test)]
mod tests;
use super::validation::{self, Metadata};
use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_contracts::{AppError, PreparedModel};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashSet, path::Path};

pub const RAW_LIMIT: usize = 50 * 1024 * 1024;
pub const TEXT_LIMIT: usize = 72 * 1024 * 1024;
const EMPTY_PREVIEW: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Source {
    format: String,
    version: u8,
    source_format: String,
    title: String,
    main: String,
    cover: String,
    files: Vec<Resource>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Resource {
    path: String,
    content: String,
}
fn invalid(message: impl Into<String>) -> AppError {
    AppError::new("model", message.into())
}
fn prepared(text: String, metadata: Metadata) -> PreparedModel {
    PreparedModel {
        id: format!("{:x}", Sha256::digest(text.as_bytes())),
        title: metadata.title,
        text: text.into(),
        preview: metadata.preview.into(),
    }
}
pub fn prepare(path: &Path, source_format: &str) -> Result<PreparedModel, AppError> {
    let root = path
        .parent()
        .ok_or_else(|| invalid("模型目录无效。"))?
        .canonicalize()
        .map_err(|_| invalid("模型目录不可读取。"))?;
    let main = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| invalid("模型文件名必须为 Unicode。"))?
        .to_owned();
    let mut total = 0;
    let bytes = resources::read(&root, &main, &mut total)?;
    let mut files = vec![Resource {
        path: main.clone(),
        content: STANDARD.encode(&bytes),
    }];
    let mut seen = HashSet::from([main.clone()]);
    let mut pending: Vec<_> = references::collect(source_format, &bytes)?
        .into_iter()
        .map(|name| (name, source_format == "obj"))
        .collect();
    while let Some((name, material)) = pending.pop() {
        let name = resources::relative(&name)?;
        if !seen.insert(name.clone()) {
            continue;
        }
        if files.len() >= 256 {
            return Err(invalid("模型关联文件不能超过 256 个。"));
        }
        let bytes = resources::read(&root, &name, &mut total)?;
        if material {
            let prefix = name.rsplit_once('/').map_or("", |(p, _)| p);
            for reference in references::mtl(&bytes)? {
                pending.push((
                    if prefix.is_empty() {
                        reference
                    } else {
                        format!("{prefix}/{reference}")
                    },
                    false,
                ));
            }
        }
        files.push(Resource {
            path: name,
            content: STANDARD.encode(bytes),
        });
    }
    let source = Source {
        format: "discatelier-source-model".into(),
        version: 1,
        source_format: source_format.into(),
        title: path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or(&main)
            .into(),
        main,
        cover: EMPTY_PREVIEW.into(),
        files,
    };
    let text = serde_json::to_string(&source).map_err(|_| invalid("模型保存失败。"))?;
    let metadata = validation::validate(&text)?;
    Ok(prepared(text, metadata))
}
pub fn validate(value: &serde_json::Value) -> Result<Metadata, AppError> {
    let source: Source =
        serde_json::from_value(value.clone()).map_err(|_| invalid("原格式模型记录无效。"))?;
    if source.format != "discatelier-source-model"
        || source.version != 1
        || !matches!(source.source_format.as_str(), "glb" | "obj" | "fbx")
        || source.files.is_empty()
        || source.files.len() > 256
    {
        return Err(invalid("原格式模型类型或文件数量无效。"));
    }
    validation::label(&value["title"], 300)?;
    validation::image(&value["cover"], &mut 0)?;
    let mut total = 0;
    let mut names = HashSet::new();
    let mut decoded = std::collections::HashMap::new();
    for file in source.files {
        if resources::relative(&file.path)? != file.path || !names.insert(file.path.clone()) {
            return Err(invalid("原格式模型资源路径重复或无效。"));
        }
        let bytes = STANDARD
            .decode(&file.content)
            .map_err(|_| invalid("原格式模型资源编码无效。"))?;
        total += bytes.len();
        if total > RAW_LIMIT {
            return Err(invalid("模型及关联资源合计不能超过 50 MiB。"));
        }
        decoded.insert(file.path, bytes);
    }
    let main = decoded
        .get(&source.main)
        .ok_or_else(|| invalid("原格式模型缺少主文件。"))?;
    for name in references::collect(&source.source_format, main)? {
        let name = resources::relative(&name)?;
        let bytes = decoded
            .get(&name)
            .ok_or_else(|| invalid(format!("缺少关联资源：{name}")))?;
        if source.source_format == "obj" {
            let prefix = name.rsplit_once('/').map_or("", |(p, _)| p);
            for reference in references::mtl(bytes)? {
                let path = resources::relative(&if prefix.is_empty() {
                    reference
                } else {
                    format!("{prefix}/{reference}")
                })?;
                if !decoded.contains_key(&path) {
                    return Err(invalid(format!("缺少关联资源：{path}")));
                }
            }
        }
    }
    Ok(Metadata {
        title: source.title,
        preview: source.cover,
    })
}
pub fn with_preview(text: &str, cover: &str) -> Result<PreparedModel, AppError> {
    if text.len() > TEXT_LIMIT || cover.len() > 2 * 1024 * 1024 {
        return Err(invalid("模型预览过大。"));
    }
    let mut source: Source =
        serde_json::from_str(text).map_err(|_| invalid("此模型不需要生成预览。"))?;
    source.cover = cover.into();
    let text = serde_json::to_string(&source).map_err(|_| invalid("模型预览保存失败。"))?;
    let metadata = validation::validate(&text)?;
    Ok(prepared(text, metadata))
}
