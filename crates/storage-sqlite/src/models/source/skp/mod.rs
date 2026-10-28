//! Offline SketchUp import. The original file remains in the model envelope.
mod geometry;
mod glb;
#[cfg(test)]
mod tests;
use super::invalid;
use discatelier_contracts::AppError;
use openskp::{Material, Model, Node, Side};
use serde_json::json;
use std::collections::BTreeMap;
pub const RENDER: &str = "__discatelier/sketchup.glb";

pub fn header(bytes: &[u8]) -> Result<(), AppError> {
    let (version, _) =
        openskp::header_info(bytes).ok_or_else(|| invalid("不是有效的 SketchUp 文件。"))?;
    let major = version
        .trim_matches(['{', '}'])
        .split('.')
        .next()
        .unwrap_or("");
    if !matches!(
        (major, openskp::detect_container(bytes)),
        ("17", openskp::Container::Carchive2017) | ("26", openskp::Container::Zip)
    ) {
        return Err(invalid(format!(
            "暂不支持 SketchUp {version}；请另存为 SketchUp 2017 或导出 GLB、OBJ。"
        )));
    }
    Ok(())
}
pub fn convert(bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    header(bytes)?;
    if openskp::detect_container(bytes) == openskp::Container::Zip {
        // Read central-directory sizes before the parser allocates decoded entries.
        let archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|_| invalid("SKP 压缩容器损坏。"))?;
        if archive.len() > 4096
            || archive.decompressed_size().unwrap_or(u128::MAX) > 128 * 1024 * 1024
        {
            return Err(invalid("SKP 解压后资源过大，请先简化。"));
        }
    }
    let model = Model::parse(bytes).map_err(|e| invalid(format!("SKP 读取失败：{e}")))?;
    if model.diagnostics.iter().any(|d| {
        d.is_desync()
            || matches!(
                d,
                openskp::Diagnostic::ContinuousFallback { .. }
                    | openskp::Diagnostic::UnresolvedSharedTexture { .. }
            )
    }) {
        return Err(invalid(
            "这个 SKP 的几何或贴图无法完整读取，请另存为 SketchUp 2017 或导出 GLB。",
        ));
    }
    let mut writer = Writer {
        model: &model,
        glb: glb::Glb::default(),
        materials: BTreeMap::new(),
        vertices: 0,
    };
    let mut roots = Vec::new();
    // The SDK's COLLADA oracle identifies the last unowned run as root geometry.
    if let Some(run) = model.geometry.iter().rev().find(|r| r.def_index.is_none()) {
        if let Some(mesh) = writer.mesh(&run.mesh, 0)? {
            let id = writer.glb.nodes.len();
            writer
                .glb
                .nodes
                .push(json!({"name":"SketchUp","mesh":mesh}));
            roots.push(id);
        }
    }
    for node in model.scene() {
        if let Some(id) = writer.node(&node, 0)? {
            roots.push(id);
        }
    }
    if writer.vertices == 0 {
        return Err(invalid("SKP 没有可显示的面，请导出包含实体面的模型。"));
    }
    let root = writer.glb.nodes.len();
    writer.glb.nodes.push(json!({"name":"SketchUp scene","rotation":[-std::f64::consts::FRAC_1_SQRT_2,0,0,std::f64::consts::FRAC_1_SQRT_2],"children":roots}));
    writer.glb.finish(vec![root])
}
struct Writer<'a> {
    model: &'a Model,
    glb: glb::Glb,
    materials: BTreeMap<u16, usize>,
    vertices: usize,
}
#[derive(Default)]
struct Buffers {
    positions: Vec<f32>,
    normals: Vec<f32>,
    uv: Vec<f32>,
}
impl Writer<'_> {
    fn material(&mut self, slot: u16) -> Result<usize, AppError> {
        if let Some(id) = self.materials.get(&slot) {
            return Ok(*id);
        }
        let mut color = [220, 220, 220, 255];
        let mut opacity = 1.;
        let mut name = "Default".to_owned();
        let mut texture = None;
        match self.model.material_of(slot) {
            Some(Material::Solid {
                name: n,
                rgba,
                opacity: o,
                ..
            }) => {
                name = n.clone();
                color = *rgba;
                opacity = *o;
            }
            Some(Material::Textured {
                name: n,
                avg_rgba,
                colorized,
                opacity: o,
                image_bytes,
                ..
            }) => {
                name = n.clone();
                opacity = *o;
                color = if *colorized {
                    avg_rgba.unwrap_or([255; 4])
                } else {
                    [255; 4]
                };
                let data = image_bytes
                    .as_ref()
                    .ok_or_else(|| invalid("SKP 贴图缺失，请先在 SketchUp 中嵌入贴图。"))?;
                let reader = image::ImageReader::new(std::io::Cursor::new(data))
                    .with_guessed_format()
                    .map_err(|_| invalid("SKP 贴图无效。"))?;
                let mime = match reader.format() {
                    Some(image::ImageFormat::Png) => "image/png",
                    Some(image::ImageFormat::Jpeg) => "image/jpeg",
                    _ => return Err(invalid("SKP 贴图必须为 PNG 或 JPEG。")),
                };
                let (w, h) = reader
                    .into_dimensions()
                    .map_err(|_| invalid("SKP 贴图无效。"))?;
                if w > 8192 || h > 8192 {
                    return Err(invalid("SKP 贴图单边不能超过 8192 像素。"));
                }
                let view = self.glb.bytes(data)?;
                let image = self.glb.images.len();
                self.glb
                    .images
                    .push(json!({"bufferView":view,"mimeType":mime}));
                texture = Some(self.glb.textures.len());
                self.glb.textures.push(json!({"source":image}));
            }
            None => {}
        }
        let linear = |v: u8| {
            let x = f64::from(v) / 255.;
            if x <= 0.04045 {
                x / 12.92
            } else {
                ((x + 0.055) / 1.055).powf(2.4)
            }
        };
        let mut mat = json!({"name":name,"pbrMetallicRoughness":{"baseColorFactor":[linear(color[0]),linear(color[1]),linear(color[2]),opacity],"metallicFactor":0,"roughnessFactor":0.8}});
        if let Some(index) = texture {
            mat["pbrMetallicRoughness"]["baseColorTexture"] = json!({"index":index});
        }
        if opacity < 1. {
            mat["alphaMode"] = json!("BLEND");
        }
        let id = self.glb.materials.len();
        self.glb.materials.push(mat);
        self.materials.insert(slot, id);
        Ok(id)
    }
    fn mesh(&mut self, mesh: &openskp::Mesh, inherited: u16) -> Result<Option<usize>, AppError> {
        let mut buffers: BTreeMap<u16, Buffers> = BTreeMap::new();
        for face in &mesh.faces {
            if face.hidden || self.model.layer_of(face.layer).is_some_and(|l| !l.visible) {
                continue;
            }
            let triangles = geometry::triangles(mesh, face)?;
            for (side, slot, sign) in [
                (Side::Front, face.front_material, 1.),
                (Side::Back, face.back_material, -1.),
            ] {
                let slot = slot.filter(|s| *s != 0).unwrap_or(inherited);
                let b = buffers.entry(slot).or_default();
                let uv = self
                    .model
                    .applied_size_of(slot)
                    .and_then(|size| face.uv_xform(side, size));
                for triangle in &triangles {
                    let mut triangle = *triangle;
                    if side == Side::Back {
                        triangle.swap(1, 2);
                    }
                    for id in triangle {
                        self.vertices += 1;
                        if self.vertices > 1_500_000 {
                            return Err(invalid("SKP 面数过多，请先简化模型。"));
                        }
                        let p = mesh.vertices[id];
                        b.positions.extend(p.map(|v| v as f32));
                        b.normals.extend(face.normal.map(|v| (v * sign) as f32));
                        let t = uv.as_ref().map_or([0., 0.], |uv| uv.apply(p));
                        b.uv.extend([t[0] as f32, (1. - t[1]) as f32]);
                    }
                }
            }
        }
        let mut primitives = Vec::new();
        for (slot, b) in buffers {
            if b.positions.is_empty() {
                continue;
            }
            let material = self.material(slot)?;
            let p = self.glb.floats(&b.positions, 3, true)?;
            let n = self.glb.floats(&b.normals, 3, false)?;
            let uv = self.glb.floats(&b.uv, 2, false)?;
            primitives.push(
                json!({"attributes":{"POSITION":p,"NORMAL":n,"TEXCOORD_0":uv},"material":material}),
            );
        }
        if primitives.is_empty() {
            return Ok(None);
        }
        let id = self.glb.meshes.len();
        self.glb.meshes.push(json!({"primitives":primitives}));
        Ok(Some(id))
    }
    fn node(&mut self, node: &Node, depth: usize) -> Result<Option<usize>, AppError> {
        if node.hidden || self.model.layer_of(node.layer).is_some_and(|l| !l.visible) {
            return Ok(None);
        }
        if depth > 48 || self.glb.nodes.len() > 4096 {
            return Err(invalid("SKP 组件层级或数量过多。"));
        }
        let t = node.local;
        let matrix = [
            t[0],
            t[3],
            t[6],
            0.,
            t[1],
            t[4],
            t[7],
            0.,
            t[2],
            t[5],
            t[8],
            0.,
            t[9] / openskp::INCH,
            t[10] / openskp::INCH,
            t[11] / openskp::INCH,
            1.,
        ];
        if !matrix.iter().all(|v| v.is_finite()) {
            return Err(invalid("SKP 组件变换无效。"));
        }
        let mut object =
            json!({"name":node.definition.as_deref().unwrap_or("Component"),"matrix":matrix});
        if let Some(run) = node.run {
            if let Some(mesh) = self.mesh(&self.model.geometry[run].mesh, node.material)? {
                object["mesh"] = json!(mesh);
            }
        }
        let mut children = Vec::new();
        for child in &node.children {
            if let Some(id) = self.node(child, depth + 1)? {
                children.push(id);
            }
        }
        object["children"] = json!(children);
        let id = self.glb.nodes.len();
        self.glb.nodes.push(object);
        Ok(Some(id))
    }
}
