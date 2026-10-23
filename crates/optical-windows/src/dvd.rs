use discatelier_contracts::{AppError, DvdChapter};
use std::path::{Path, PathBuf};

const SECTOR: usize = 2048;
const MAX_IFO: usize = 8 * 1024 * 1024;

fn be16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes(
        bytes.get(offset..offset + 2)?.try_into().ok()?,
    ))
}
fn be32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}
fn byte(bytes: &[u8], offset: usize) -> Option<u8> {
    bytes.get(offset).copied()
}
fn read_ifo(path: &Path) -> Result<Vec<u8>, AppError> {
    let bytes = std::fs::read(path).map_err(|_| AppError::new("dvd", "无法读取 DVD IFO。"))?;
    if bytes.len() < SECTOR || bytes.len() > MAX_IFO {
        return Err(AppError::new("dvd", "DVD IFO 大小无效。"));
    }
    Ok(bytes)
}
fn sector_span(bytes: &[u8], sector: u32) -> Option<&[u8]> {
    let start = usize::try_from(sector).ok()?.checked_mul(SECTOR)?;
    let end = start.checked_add(SECTOR)?;
    bytes.get(start..end)
}
fn bcd(value: u8) -> u32 {
    u32::from(value >> 4) * 10 + u32::from(value & 0x0f)
}
fn playback_seconds(bytes: &[u8], offset: usize) -> Option<f64> {
    let hour = bcd(byte(bytes, offset)?);
    let minute = bcd(byte(bytes, offset + 1)?);
    let second = bcd(byte(bytes, offset + 2)?);
    let frame_byte = byte(bytes, offset + 3)?;
    let frames = u32::from(frame_byte & 0x3f);
    let fps = match (frame_byte & 0xc0) >> 6 {
        3 => 29.97,
        _ => 25.0,
    };
    Some(hour as f64 * 3600.0 + minute as f64 * 60.0 + second as f64 + frames as f64 / fps)
}

fn title_map(vmg: &[u8], title: u32) -> Option<(u8, u8)> {
    if vmg.get(..12)? != b"DVDVIDEO-VMG" {
        return None;
    }
    let sector = be32(vmg, 196)?;
    let table = sector_span(vmg, sector)?;
    let count = usize::from(be16(table, 0)?);
    if title == 0 || title as usize > count {
        return None;
    }
    let entry = 8 + (title as usize - 1) * 12;
    Some((byte(table, entry + 6)?, byte(table, entry + 7)?))
}

fn pgc_offset(pgcit: &[u8], vts_ttn: u8) -> Option<usize> {
    let count = usize::from(be16(pgcit, 0)?);
    if count == 0 {
        return None;
    }
    let mut fallback = None;
    for index in 0..count {
        let pointer = 8 + index * 8;
        let entry_id = byte(pgcit, pointer)?;
        let offset = be32(pgcit, pointer + 4)? as usize;
        if offset >= pgcit.len() {
            continue;
        }
        if entry_id == vts_ttn {
            return Some(offset);
        }
        if index + 1 == usize::from(vts_ttn) {
            fallback = Some(offset);
        }
    }
    fallback
}

fn chapters_from_pgc(pgc: &[u8]) -> Option<Vec<DvdChapter>> {
    let programs = usize::from(byte(pgc, 2)?);
    let cells = usize::from(byte(pgc, 3)?);
    if programs == 0 || cells == 0 {
        return None;
    }
    let program_map = usize::from(be16(pgc, 230)?);
    let cell_table = usize::from(be16(pgc, 232)?);
    let mut durations = Vec::with_capacity(cells);
    for index in 0..cells {
        durations.push(playback_seconds(pgc, cell_table + index * 24 + 4)?);
    }
    let mut starts = Vec::with_capacity(programs);
    for program in 0..programs {
        let cell_number = usize::from(byte(pgc, program_map + program)?);
        if cell_number == 0 || cell_number > cells {
            return None;
        }
        starts.push(durations.iter().take(cell_number - 1).sum::<f64>());
    }
    starts.dedup_by(|left, right| (*left - *right).abs() < 0.001);
    let total = durations.iter().sum::<f64>();
    let mut result = Vec::with_capacity(starts.len());
    for (index, start) in starts.iter().enumerate() {
        let end = starts.get(index + 1).copied().unwrap_or(total);
        result.push(DvdChapter {
            index: index as u32 + 1,
            start_seconds: *start,
            duration_seconds: (end - start).max(0.0),
        });
    }
    (result.len() > 1).then_some(result)
}

pub fn chapters(root: &Path, title: u32) -> Result<Vec<DvdChapter>, AppError> {
    let vmg = read_ifo(&root.join("VIDEO_TS").join("VIDEO_TS.IFO"))?;
    let (vts, vts_ttn) =
        title_map(&vmg, title).ok_or_else(|| AppError::new("dvd", "找不到 DVD 标题。"))?;
    if vts == 0 {
        return Err(AppError::new("dvd", "DVD 标题不属于任何 VTS。"));
    }
    let path: PathBuf = root.join("VIDEO_TS").join(format!("VTS_{vts:02}_0.IFO"));
    let vts_ifo = read_ifo(&path)?;
    if vts_ifo.get(..12) != Some(b"DVDVIDEO-VTS") {
        return Err(AppError::new("dvd", "DVD VTS IFO 标识无效。"));
    }
    let sector = be32(&vts_ifo, 204).ok_or_else(|| AppError::new("dvd", "DVD VTS 目录无效。"))?;
    let pgcit =
        sector_span(&vts_ifo, sector).ok_or_else(|| AppError::new("dvd", "DVD VTS 目录越界。"))?;
    let offset = pgc_offset(pgcit, vts_ttn)
        .ok_or_else(|| AppError::new("dvd", "找不到 DVD 标题的 PGC。"))?;
    let pgc = pgcit
        .get(offset..)
        .ok_or_else(|| AppError::new("dvd", "DVD PGC 越界。"))?;
    chapters_from_pgc(pgc).ok_or_else(|| AppError::new("dvd", "DVD 没有可用的章节信息。"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
        bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
    }
    fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
        bytes[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
    }
    fn time(h: u8, m: u8, s: u8) -> [u8; 4] {
        [h, m, s, 0x40]
    }

    #[test]
    fn synthetic_ifo_reports_two_chapters() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("discatelier-dvd-{stamp}"));
        std::fs::create_dir_all(dir.join("VIDEO_TS")).unwrap();
        let mut vmg = vec![0u8; SECTOR * 2];
        vmg[..12].copy_from_slice(b"DVDVIDEO-VMG");
        put_u32(&mut vmg, 196, 1);
        let table = SECTOR;
        put_u16(&mut vmg, table, 1);
        vmg[table + 8 + 6] = 1; // title set
        vmg[table + 8 + 7] = 1; // vts title number
        std::fs::write(dir.join("VIDEO_TS/VIDEO_TS.IFO"), vmg).unwrap();

        let mut vts = vec![0u8; SECTOR * 2];
        vts[..12].copy_from_slice(b"DVDVIDEO-VTS");
        put_u32(&mut vts, 204, 1);
        let pgcit = SECTOR;
        put_u16(&mut vts, pgcit, 1);
        vts[pgcit + 8] = 1;
        put_u32(&mut vts, pgcit + 8 + 4, 16);
        let pgc = pgcit + 16;
        vts[pgc + 2] = 2; // programs
        vts[pgc + 3] = 2; // cells
        let program_map = 236;
        let cell_table = 240;
        put_u16(&mut vts, pgc + 230, program_map as u16);
        put_u16(&mut vts, pgc + 232, cell_table as u16);
        vts[pgc + program_map] = 1;
        vts[pgc + program_map + 1] = 2;
        let first = pgc + cell_table + 4;
        vts[first..first + 4].copy_from_slice(&time(0, 1, 0));
        let second = pgc + cell_table + 24 + 4;
        vts[second..second + 4].copy_from_slice(&time(0, 2, 0));
        std::fs::write(dir.join("VIDEO_TS/VTS_01_0.IFO"), vts).unwrap();

        let result = chapters(&dir, 1).unwrap();
        assert_eq!(result.len(), 2);
        assert!((result[0].start_seconds - 0.0).abs() < 0.001);
        assert!((result[1].start_seconds - 60.0).abs() < 0.001);
        for file in ["VIDEO_TS/VIDEO_TS.IFO", "VIDEO_TS/VTS_01_0.IFO"] {
            std::fs::remove_file(dir.join(file)).unwrap();
        }
        std::fs::remove_dir(dir.join("VIDEO_TS")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
