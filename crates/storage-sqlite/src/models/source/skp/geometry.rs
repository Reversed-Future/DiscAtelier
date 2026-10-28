use super::super::invalid;
use discatelier_contracts::AppError;
use openskp::{Mesh, MeshFace};

/// Project a planar polygon onto its strongest plane, preserving holes.
pub fn triangles(mesh: &Mesh, face: &MeshFace) -> Result<Vec<[usize; 3]>, AppError> {
    if face.outer.len() < 3 {
        return Ok(Vec::new());
    }
    let drop = (0..3)
        .max_by(|a, b| face.normal[*a].abs().total_cmp(&face.normal[*b].abs()))
        .unwrap();
    let axes: Vec<_> = (0..3).filter(|i| *i != drop).collect();
    let mut ids = Vec::new();
    let mut coords = Vec::new();
    let mut holes = Vec::new();
    for (i, ring) in std::iter::once(&face.outer).chain(&face.holes).enumerate() {
        if i > 0 {
            holes.push(ids.len());
        }
        for id in ring {
            let p = mesh
                .vertices
                .get(*id as usize)
                .ok_or_else(|| invalid("SKP 面引用了不存在的顶点。"))?;
            if !p.iter().all(|v| v.is_finite()) {
                return Err(invalid("SKP 顶点无效。"));
            }
            ids.push(*id as usize);
            coords.extend([p[axes[0]], p[axes[1]]]);
        }
    }
    if ids.len() > 100_000 {
        return Err(invalid("SKP 单个面的顶点过多，请先简化。"));
    }
    let indices =
        earcutr::earcut(&coords, &holes, 2).map_err(|_| invalid("SKP 多边形无法转换。"))?;
    let mut out = Vec::new();
    for t in indices.chunks_exact(3) {
        let mut tri = [ids[t[0]], ids[t[1]], ids[t[2]]];
        let a = mesh.vertices[tri[0]];
        let b = mesh.vertices[tri[1]];
        let c = mesh.vertices[tri[2]];
        let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let n = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
        ];
        if n.iter().zip(face.normal).map(|(a, b)| a * b).sum::<f64>() < 0.0 {
            tri.swap(1, 2);
        }
        out.push(tri);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hole_is_not_filled_and_winding_matches_face() {
        let mesh = Mesh {
            vertices: vec![
                [0., 0., 0.],
                [4., 0., 0.],
                [4., 4., 0.],
                [0., 4., 0.],
                [1., 1., 0.],
                [1., 3., 0.],
                [3., 3., 0.],
                [3., 1., 0.],
            ],
            ..Default::default()
        };
        let face = MeshFace {
            outer: vec![0, 1, 2, 3],
            holes: vec![vec![4, 5, 6, 7]],
            ..Default::default()
        };
        let mut area = 0.;
        for [a, b, c] in triangles(&mesh, &face).unwrap() {
            let a = mesh.vertices[a];
            let b = mesh.vertices[b];
            let c = mesh.vertices[c];
            let cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            assert!(cross > 0.);
            area += cross / 2.;
        }
        assert!((area - 12.).abs() < 1e-8);
    }
}
