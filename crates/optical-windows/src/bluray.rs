//! Read-only Blu-ray playlist metadata.
//!
//! A Blu-ray movie is commonly authored as one `MPLS` playlist containing
//! several `M2TS` play items (seamless branching). Other playlists are usually
//! trailers or extras, so they are never concatenated or looped. libbluray/MPV
//! already read the selected playlist end to end; this adapter exposes its
//! internal segment and chapter boundaries so the UI can show one complete
//! progress bar for that title. Only the small playlist file is read; no disc
//! write, region change, or decryption bypass is performed here.

use discatelier_contracts::{
    AppError, BlurayAudioStream, BlurayChapter, BlurayPlaylist, BluraySegment,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

/// The playlist file is metadata, not media; reject unexpectedly large input.
const MAX_MPLS_BYTES: usize = 8 * 1024 * 1024;
const HEADER_BYTES: usize = 40;
const MAX_PLAY_ITEMS: usize = 1000;
const MAX_MARKS: usize = 10_000;
/// Blu-ray playlist times use a 45 kHz clock.
const TICKS_PER_SECOND: f64 = 45_000.0;

fn invalid(message: impl Into<String>) -> AppError {
    AppError::new("bluray", message)
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    Some(u16::from_be_bytes(
        bytes.get(offset..offset.checked_add(2)?)?.try_into().ok()?,
    ))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes(
        bytes.get(offset..offset.checked_add(4)?)?.try_into().ok()?,
    ))
}

fn text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .chars()
        .filter(|value| !value.is_control())
        .collect()
}

/// Read one playlist from `<root>/BDMV/PLAYLIST/<name>`.
pub fn playlist(root: &Path, name: &str) -> Result<BlurayPlaylist, AppError> {
    if name.len() != 10
        || !name.ends_with(".mpls")
        || !name.as_bytes()[..5].iter().all(u8::is_ascii_digit)
    {
        return Err(invalid("蓝光播放列表名称无效。"));
    }
    let path: PathBuf = root.join("BDMV").join("PLAYLIST").join(name);
    let bytes = fs::read(&path).map_err(|_| invalid("无法读取蓝光播放列表。"))?;
    parse(&bytes, name)
}

/// Read every valid playlist. A single malformed file never hides the rest of
/// the disc because the caller only needs ranking and progress metadata.
pub fn playlists(root: &Path, names: &[String]) -> Vec<BlurayPlaylist> {
    names
        .iter()
        .take(MAX_PLAY_ITEMS)
        .filter_map(|name| playlist(root, name).ok())
        .collect()
}

fn parse(bytes: &[u8], name: &str) -> Result<BlurayPlaylist, AppError> {
    if bytes.len() < HEADER_BYTES {
        return Err(invalid("蓝光播放列表过短。"));
    }
    if bytes.len() > MAX_MPLS_BYTES {
        return Err(invalid("蓝光播放列表超过读取上限。"));
    }
    let signature = bytes
        .get(..8)
        .ok_or_else(|| invalid("蓝光播放列表标识缺失。"))?;
    if signature != b"MPLS0200" && signature != b"MPLS0100" {
        return Err(invalid("蓝光播放列表标识无效。"));
    }
    let list_pos = read_u32(bytes, 8).ok_or_else(|| invalid("播放列表目录无效。"))? as usize;
    let mark_pos = read_u32(bytes, 12).ok_or_else(|| invalid("播放列表章节目录无效。"))? as usize;
    if list_pos < HEADER_BYTES {
        return Err(invalid("播放列表目录位置无效。"));
    }
    let list_length =
        read_u32(bytes, list_pos).ok_or_else(|| invalid("播放列表长度无效。"))? as usize;
    let list_end = list_pos
        .checked_add(4)
        .and_then(|value| value.checked_add(list_length))
        .filter(|value| *value <= bytes.len())
        .ok_or_else(|| invalid("播放列表长度越界。"))?;
    let count =
        read_u16(bytes, list_pos + 6).ok_or_else(|| invalid("播放列表项目数无效。"))? as usize;
    if count == 0 || count > MAX_PLAY_ITEMS {
        return Err(invalid("播放列表项目数超出范围。"));
    }

    let mut cursor = list_pos + 10;
    let mut segments = Vec::with_capacity(count);
    let mut starts = Vec::with_capacity(count);
    let mut audio_streams: Vec<BlurayAudioStream> = Vec::new();
    let mut elapsed = 0.0f64;
    for index in 0..count {
        let length = read_u16(bytes, cursor).ok_or_else(|| invalid("播放项目长度无效。"))? as usize;
        let body = cursor
            .checked_add(2)
            .ok_or_else(|| invalid("播放项目位置无效。"))?;
        let end = body
            .checked_add(length)
            .ok_or_else(|| invalid("播放项目长度无效。"))?;
        if length < 20 || end > list_end {
            return Err(invalid("播放项目长度越界。"));
        }
        let clip = bytes
            .get(body..body + 5)
            .ok_or_else(|| invalid("播放项目 Clip 缺失。"))?;
        if bytes.get(body + 5..body + 9) != Some(b"M2TS".as_slice()) {
            return Err(invalid("播放项目编码标识无效。"));
        }
        let flags = read_u16(bytes, body + 9).ok_or_else(|| invalid("播放项目标记无效。"))?;
        let connection_condition = (flags & 0x0f) as u8;
        let multi_angle = flags & 0x10 != 0;
        let angle_count = if multi_angle {
            bytes.get(body + 32).copied().unwrap_or(1).max(1)
        } else {
            1
        };
        let in_time = read_u32(bytes, body + 12).ok_or_else(|| invalid("播放项目入点无效。"))?;
        let out_time = read_u32(bytes, body + 16).ok_or_else(|| invalid("播放项目出点无效。"))?;
        if out_time < in_time {
            return Err(invalid("播放项目时间范围无效。"));
        }
        let duration = f64::from(out_time - in_time) / TICKS_PER_SECOND;
        let stn = body
            + 32
            + if multi_angle {
                2 + 10usize.saturating_mul(usize::from(angle_count).saturating_sub(1))
            } else {
                0
            };
        for stream in parse_audio_streams(bytes, stn, end) {
            if !audio_streams.iter().any(|known| known.pid == stream.pid) {
                audio_streams.push(stream);
            }
        }
        starts.push(elapsed);
        segments.push(BluraySegment {
            index: index as u32,
            clip_id: text(clip),
            start_seconds: round(elapsed),
            duration_seconds: round(duration),
            seamless: matches!(connection_condition, 5 | 6),
            angle_count,
        });
        elapsed += duration;
        cursor = end;
    }
    let total = elapsed;
    let chapters = parse_marks(bytes, mark_pos, &starts, total);
    Ok(BlurayPlaylist {
        playlist: name.into(),
        duration_seconds: round(total),
        segments,
        chapters,
        audio_streams,
    })
}

fn skip_stream(bytes: &[u8], cursor: usize, end: usize) -> Option<usize> {
    // A stream entry is two length-prefixed blocks: stream type/PID, then
    // codec attributes. Video entries must skip both to reach the audio table.
    let length = usize::from(*bytes.get(cursor)?);
    let attributes = cursor.checked_add(1)?.checked_add(length)?;
    if attributes > end {
        return None;
    }
    let attribute_length = usize::from(*bytes.get(attributes)?);
    let next = attributes.checked_add(1)?.checked_add(attribute_length)?;
    (next <= end).then_some(next)
}

fn parse_audio_streams(bytes: &[u8], stn: usize, end: usize) -> Vec<BlurayAudioStream> {
    if stn.checked_add(2).map_or(true, |value| value > end) {
        return Vec::new();
    }
    let Some(length) = read_u16(bytes, stn) else {
        return Vec::new();
    };
    let Some(table_end) = stn
        .checked_add(2)
        .and_then(|value| value.checked_add(usize::from(length)))
    else {
        return Vec::new();
    };
    if table_end > end {
        return Vec::new();
    }
    let Some(mut cursor) = stn.checked_add(4) else {
        return Vec::new();
    };
    let Some(video) = bytes.get(cursor).copied() else {
        return Vec::new();
    };
    cursor += 1;
    let Some(audio) = bytes.get(cursor).copied() else {
        return Vec::new();
    };
    cursor += 1;
    // Six remaining stream counts and four reserved bytes.
    cursor += 10;
    for _ in 0..video {
        let Some(next) = skip_stream(bytes, cursor, table_end) else {
            return Vec::new();
        };
        cursor = next;
    }
    let mut streams = Vec::new();
    for _ in 0..audio {
        let Some(length) = bytes.get(cursor).copied().map(usize::from) else {
            return streams;
        };
        let stream_start = cursor + 1;
        let Some(attributes) = stream_start.checked_add(length) else {
            return streams;
        };
        if attributes + 1 > table_end {
            return streams;
        }
        let stream_type = bytes[stream_start];
        let pid = match stream_type {
            1 => read_u16(bytes, stream_start + 1),
            2 => read_u16(bytes, stream_start + 3),
            3 | 4 => read_u16(bytes, stream_start + 2),
            _ => None,
        };
        let Some(attribute_length) = bytes.get(attributes).copied().map(usize::from) else {
            return streams;
        };
        let attribute = attributes + 1;
        let Some(next) = attribute.checked_add(attribute_length) else {
            return streams;
        };
        if next > table_end || attribute_length < 2 {
            return streams;
        }
        let coding = bytes[attribute];
        let format = bytes[attribute + 1] >> 4;
        let language = bytes
            .get(attribute + 2..attribute + 5)
            .map(text)
            .unwrap_or_default();
        let codec = match coding {
            0x80 => "LPCM",
            0x81 => "AC-3",
            0x82 => "DTS",
            0x83 => "TrueHD",
            0x84 => "AC-3 Plus",
            0x85 => "DTS-HD",
            0x86 => "DTS-HD Master",
            0xa1 => "AC-3 Plus (secondary)",
            0xa2 => "DTS-HD (secondary)",
            _ => "",
        }
        .to_string();
        if let Some(pid) = pid {
            streams.push(BlurayAudioStream {
                pid,
                language,
                codec,
                channels: match format {
                    1 => Some(1),
                    3 => Some(2),
                    6 => Some(6),
                    _ => None,
                },
                format,
            });
        }
        cursor = next;
    }
    streams
}

fn parse_marks(bytes: &[u8], mark_pos: usize, starts: &[f64], total: f64) -> Vec<BlurayChapter> {
    if mark_pos < HEADER_BYTES || mark_pos + 6 > bytes.len() {
        return Vec::new();
    }
    let Some(length) = read_u32(bytes, mark_pos) else {
        return Vec::new();
    };
    let end = match mark_pos
        .checked_add(4)
        .and_then(|value| value.checked_add(length as usize))
    {
        Some(value) if value <= bytes.len() => value,
        _ => return Vec::new(),
    };
    let Some(count) = read_u16(bytes, mark_pos + 4) else {
        return Vec::new();
    };
    let count = usize::from(count).min(MAX_MARKS);
    let mut result = Vec::new();
    for index in 0..count {
        let offset = mark_pos + 6 + index * 14;
        if offset + 14 > end {
            break;
        }
        let mark_type = bytes[offset + 1];
        if mark_type != 1 {
            continue;
        }
        let Some(play_item) = read_u16(bytes, offset + 2).map(usize::from) else {
            break;
        };
        let Some(ticks) = read_u32(bytes, offset + 4) else {
            break;
        };
        let Some(item_start) = starts.get(play_item) else {
            continue;
        };
        let start = item_start + f64::from(ticks) / TICKS_PER_SECOND;
        if !start.is_finite() || start < 0.0 || start > total + 0.001 {
            continue;
        }
        if result
            .last()
            .is_some_and(|chapter: &BlurayChapter| (chapter.start_seconds - start).abs() < 0.05)
        {
            continue;
        }
        result.push(BlurayChapter {
            index: result.len() as u32 + 1,
            start_seconds: round(start),
            duration_seconds: 0.0,
        });
    }
    result.sort_by(|left, right| left.start_seconds.total_cmp(&right.start_seconds));
    for index in 0..result.len() {
        let start = result[index].start_seconds;
        let next = result
            .get(index + 1)
            .map(|chapter| chapter.start_seconds)
            .unwrap_or(total);
        result[index].index = index as u32 + 1;
        result[index].duration_seconds = round((next - start).max(0.0));
    }
    result
}

fn round(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put_u16(bytes: &mut Vec<u8>, value: u16) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }

    fn put_u32(bytes: &mut Vec<u8>, value: u32) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }

    fn play_item_with_audio(
        clip: &str,
        in_seconds: u32,
        out_seconds: u32,
        connection: u8,
        audio: Option<Vec<u8>>,
    ) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(clip.as_bytes());
        body.extend_from_slice(b"M2TS");
        // 11 reserved bits, no multi-angle, then the connection condition.
        put_u16(&mut body, u16::from(connection));
        body.push(0); // STC id
        put_u32(&mut body, in_seconds * 45_000);
        put_u32(&mut body, out_seconds * 45_000);
        // UO mask, random-access flag, still mode/time. The playlist parser
        // ignores these, but the STN table starts after them.
        body.extend_from_slice(&[0; 12]);
        if let Some(audio) = audio {
            body.extend_from_slice(&audio);
        }
        let mut item = Vec::new();
        put_u16(&mut item, body.len() as u16);
        item.extend_from_slice(&body);
        item
    }

    fn play_item(clip: &str, in_seconds: u32, out_seconds: u32, connection: u8) -> Vec<u8> {
        play_item_with_audio(clip, in_seconds, out_seconds, connection, None)
    }

    fn audio_stn() -> Vec<u8> {
        let mut entries = Vec::new();
        for (pid, coding, format, language) in [
            (4352u16, 0x86u8, 6u8, b"jpn"),
            (4353, 0x86, 3, b"jpn"),
            (4354, 0x86, 6, b"eng"),
            (4355, 0x86, 3, b"jpn"),
        ] {
            entries.push(3);
            entries.push(1);
            put_u16(&mut entries, pid);
            entries.push(5);
            entries.push(coding);
            entries.push(format << 4);
            entries.extend_from_slice(language);
        }
        let mut payload = vec![0, 0];
        payload.extend_from_slice(&[0, 4, 0, 0, 0, 0, 0, 0]);
        payload.extend_from_slice(&[0; 4]);
        payload.extend_from_slice(&entries);
        let mut result = Vec::new();
        put_u16(&mut result, payload.len() as u16);
        result.extend_from_slice(&payload);
        result
    }

    fn fixture() -> Vec<u8> {
        let items = [
            play_item_with_audio("00001", 0, 60, 5, Some(audio_stn())),
            play_item("00002", 10, 70, 6),
            play_item("00003", 0, 30, 1),
        ];
        // After the length field: reserved (2) + item count (2) + subpath
        // count (2), then the play items.
        let list_length = 6 + items.iter().map(|item| item.len()).sum::<usize>();
        let mark_offset = HEADER_BYTES + 4 + list_length;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"MPLS0200");
        put_u32(&mut bytes, HEADER_BYTES as u32);
        put_u32(&mut bytes, mark_offset as u32);
        put_u32(&mut bytes, 0);
        bytes.extend_from_slice(&[0; 20]);
        put_u32(&mut bytes, list_length as u32);
        put_u16(&mut bytes, 0);
        put_u16(&mut bytes, items.len() as u16);
        put_u16(&mut bytes, 0);
        for item in items {
            bytes.extend_from_slice(&item);
        }
        // Two chapter marks: 10s into the first item and 5s into the third.
        put_u32(&mut bytes, (2 + 2 * 14) as u32);
        put_u16(&mut bytes, 2);
        for (item, seconds) in [(0u16, 10u32), (2, 5)] {
            bytes.push(0);
            bytes.push(1);
            put_u16(&mut bytes, item);
            put_u32(&mut bytes, seconds * 45_000);
            put_u16(&mut bytes, 0);
            put_u32(&mut bytes, 0);
        }
        bytes
    }

    #[test]
    fn playlist_sums_all_segments_and_marks_full_timeline() {
        let value = parse(&fixture(), "00001.mpls").unwrap();
        assert_eq!(value.segments.len(), 3);
        assert_eq!(value.duration_seconds, 150.0);
        assert_eq!(value.segments[0].duration_seconds, 60.0);
        assert_eq!(value.segments[1].start_seconds, 60.0);
        assert!(value.segments[0].seamless);
        assert!(value.segments[1].seamless);
        assert!(!value.segments[2].seamless);
        assert_eq!(value.segments[2].clip_id, "00003");
        assert_eq!(value.chapters.len(), 2);
        assert_eq!(value.chapters[0].start_seconds, 10.0);
        assert_eq!(value.chapters[0].duration_seconds, 115.0);
        assert_eq!(value.chapters[1].start_seconds, 125.0);
        assert_eq!(value.audio_streams.len(), 4);
        assert_eq!(value.audio_streams[0].pid, 4352);
        assert_eq!(value.audio_streams[0].language, "jpn");
        assert_eq!(value.audio_streams[0].codec, "DTS-HD Master");
        assert_eq!(value.audio_streams[0].channels, Some(6));
        assert_eq!(value.audio_streams[3].channels, Some(2));
        assert_eq!(value.audio_streams[2].language, "eng");
    }

    #[test]
    fn malformed_or_unknown_playlist_is_rejected() {
        assert!(parse(b"short", "00001.mpls").is_err());
        assert!(parse(&[0u8; HEADER_BYTES], "00001.mpls").is_err());
        assert!(playlist(Path::new("Z:\\not-a-disc"), "00001.mpls").is_err());
        assert!(playlist(Path::new("Z:\\not-a-disc"), "..\\0001.mpls").is_err());
    }
}
