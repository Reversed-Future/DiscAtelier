//! Small glTF 2.0 writer for the static SketchUp import adapter.
use super::super::{invalid, RAW_LIMIT};
use discatelier_contracts::AppError;
use serde_json::{json, Value};

#[derive(Default)]
pub struct Glb {
    pub binary: Vec<u8>,
    pub views: Vec<Value>,
    pub accessors: Vec<Value>,
    pub meshes: Vec<Value>,
    pub nodes: Vec<Value>,
    pub materials: Vec<Value>,
    pub images: Vec<Value>,
    pub textures: Vec<Value>,
}
impl Glb {
    pub fn bytes(&mut self, bytes: &[u8]) -> Result<usize, AppError> {
        if self.binary.len() + bytes.len() > RAW_LIMIT {
            return Err(invalid("SKP 转换后的模型过大，请先简化。"));
        }
        let i = self.views.len();
        self.views
            .push(json!({"buffer":0,"byteOffset":self.binary.len(),"byteLength":bytes.len()}));
        self.binary.extend_from_slice(bytes);
        while !self.binary.len().is_multiple_of(4) {
            self.binary.push(0);
        }
        Ok(i)
    }
    pub fn floats(&mut self, data: &[f32], size: usize, position: bool) -> Result<usize, AppError> {
        if !data.iter().all(|v| v.is_finite()) {
            return Err(invalid("SKP 包含无效坐标。"));
        }
        let view = self.bytes(
            &data
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect::<Vec<_>>(),
        )?;
        let mut value = json!({"bufferView":view,"componentType":5126,"count":data.len()/size,"type":if size==3 {"VEC3"} else {"VEC2"}});
        if position {
            let mut min = vec![f32::INFINITY; size];
            let mut max = vec![f32::NEG_INFINITY; size];
            for p in data.chunks_exact(size) {
                for k in 0..size {
                    min[k] = min[k].min(p[k]);
                    max[k] = max[k].max(p[k]);
                }
            }
            value["min"] = json!(min);
            value["max"] = json!(max);
        }
        let i = self.accessors.len();
        self.accessors.push(value);
        Ok(i)
    }
    pub fn finish(self, roots: Vec<usize>) -> Result<Vec<u8>, AppError> {
        let document = json!({"asset":{"version":"2.0","generator":"DiscAtelier SketchUp import"},"scene":0,"scenes":[{"nodes":roots}],
            "nodes":self.nodes,"meshes":self.meshes,"materials":self.materials,"accessors":self.accessors,"bufferViews":self.views,
            "buffers":[{"byteLength":self.binary.len()}],"images":self.images,"textures":self.textures});
        let mut json = serde_json::to_vec(&document).map_err(|_| invalid("SKP 场景转换失败。"))?;
        while json.len() % 4 != 0 {
            json.push(b' ');
        }
        let length = 28 + json.len() + self.binary.len();
        if length > RAW_LIMIT {
            return Err(invalid("SKP 转换后的模型过大，请先简化。"));
        }
        let mut out = Vec::with_capacity(length);
        for value in [
            0x46546c67u32,
            2,
            length as u32,
            json.len() as u32,
            0x4e4f534a,
        ] {
            out.extend(value.to_le_bytes());
        }
        out.extend(json);
        out.extend((self.binary.len() as u32).to_le_bytes());
        out.extend(0x004e4942u32.to_le_bytes());
        out.extend(self.binary);
        Ok(out)
    }
}
