//! Bounded IOCTL_CDROM_READ_TOC decoding; no sector writes or drive configuration.
use discatelier_contracts::{CdTrack, OpticalKind, OpticalMedium};
use sha2::{Digest, Sha256};

pub fn decode(bytes: &[u8]) -> Option<OpticalMedium> {
    let header = bytes.get(..4)?;
    let size = u16::from_be_bytes([header[0], header[1]]) as usize + 2;
    let first = header[2];
    let last = header[3];
    if first == 0 || last < first || last > 99 {
        return None;
    }
    let count = usize::from(last - first + 1);
    if size < 4 + (count + 1) * 8 || size > bytes.len() {
        return None;
    }
    let entries: Vec<_> = bytes[4..4 + (count + 1) * 8].chunks_exact(8).collect();
    if entries[count][2] != 0xaa {
        return None;
    }
    let frames = |entry: &[u8]| -> Option<u32> {
        let (m, s, f) = (entry[5] as u32, entry[6] as u32, entry[7] as u32);
        (s < 60 && f < 75).then_some((m * 60 + s) * 75 + f)
    };
    let mut tracks = Vec::new();
    for i in 0..count {
        let entry = entries[i];
        if entry[2] != first + i as u8 {
            return None;
        }
        let start = frames(entry)?;
        let end = frames(entries[i + 1])?;
        if start < 150 || end <= start {
            return None;
        }
        // TRACK_DATA.Control is the low nibble; AUDIO_DATA_TRACK is bit 2.
        if entry[1] & 4 == 0 {
            tracks.push(CdTrack {
                number: entry[2],
                duration_seconds: f64::from(end - start) / 75.0,
            });
        }
    }
    if tracks.is_empty() {
        return None;
    }
    // VLC's track-only entry point indexes its own TOC array. Mixed-mode and
    // non-1-based TOCs require explicit sector boundaries before playback is safe.
    let playable = first == 1 && tracks.len() == count;
    Some(OpticalMedium {
        label: "音频 CD".into(),
        file_system: "CD-DA".into(),
        token: format!("{:x}", Sha256::digest(&bytes[..4 + (count + 1) * 8])),
        kind: OpticalKind::AudioCd,
        playlists: tracks
            .iter()
            .filter(|_| playable)
            .map(|t| format!("cd-track:{}", t.number))
            .collect(),
        tracks,
        aacs_directory: false,
        java_directory: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn optiarc_three_track_cd_provides_all_playback_routes() {
        // Read-only capture from Optiarc BC-5500S: 36-byte, three-track TOC.
        let bytes = [
            0, 34, 1, 3, 0, 0x10, 1, 0, 0, 0, 2, 0, 0, 0x10, 2, 0, 0, 4, 18, 8, 0, 0x10, 3, 0, 0,
            7, 48, 49, 0, 0x10, 0xaa, 0, 0, 12, 24, 4,
        ];
        let disc = decode(&bytes).unwrap();
        assert_eq!(disc.playlists, ["cd-track:1", "cd-track:2", "cd-track:3"]);
        assert_eq!(disc.tracks.len(), 3);
        assert_eq!(disc.tracks[0].duration_seconds, 19208.0 / 75.0);
        assert_eq!(disc.tracks[1].duration_seconds, 15791.0 / 75.0);
        assert_eq!(disc.tracks[2].duration_seconds, 20655.0 / 75.0);
    }
    #[test]
    fn audio_toc_keeps_physical_numbers_rejects_data_and_truncation() {
        let mut bytes = vec![
            0, 26, 1, 2, 0, 0x10, 1, 0, 0, 0, 2, 0, 0, 0x14, 2, 0, 0, 3, 2, 0, 0, 0x10, 0xaa, 0, 0,
            5, 2, 0,
        ];
        let disc = decode(&bytes).unwrap();
        assert_eq!(disc.tracks.len(), 1);
        assert_eq!(disc.tracks[0].duration_seconds, 180.0);
        assert!(disc.playlists.is_empty());
        assert!(decode(&bytes[..20]).is_none());
        bytes[19] = 1;
        assert_ne!(disc.token, decode(&bytes).unwrap().token);
        bytes[6] = 3;
        assert!(decode(&bytes).is_none());
        bytes[6] = 1;
        bytes[13] = 0x10;
        assert_eq!(
            decode(&bytes).unwrap().playlists,
            vec!["cd-track:1", "cd-track:2"]
        );
    }
}
