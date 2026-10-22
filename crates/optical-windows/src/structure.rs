use discatelier_contracts::{OpticalKind, OpticalMedium};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Read, path::Path};

pub fn inspect(
    root: &Path,
    label: String,
    file_system: String,
    serial: u32,
) -> std::io::Result<OpticalMedium> {
    let index = root.join("BDMV").join("index.bdmv");
    let bluray = index.is_file();
    let dvd_index = root.join("VIDEO_TS").join("VIDEO_TS.IFO");
    let dvd = !bluray && dvd_index.is_file();
    let mut hash = Sha256::new();
    hash.update(serial.to_le_bytes());
    let mut playlists = Vec::new();
    if bluray {
        // The entire optical adapter has no write API. Bound all metadata reads.
        let mut bytes = Vec::new();
        File::open(&index)?
            .take(1024 * 1024)
            .read_to_end(&mut bytes)?;
        hash.update(&bytes);
        for entry in std::fs::read_dir(root.join("BDMV").join("PLAYLIST"))? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if name.len() == 10
                && name.ends_with(".mpls")
                && name.as_bytes()[..5].iter().all(u8::is_ascii_digit)
            {
                playlists.push(name);
            }
            if playlists.len() > 10000 {
                return Err(std::io::Error::other("播放列表数量超限"));
            }
        }
        playlists.sort();
        for name in &playlists {
            hash.update(name.as_bytes());
        }
    }
    if dvd {
        let mut bytes = Vec::new();
        File::open(dvd_index)?
            .take(1024 * 1024)
            .read_to_end(&mut bytes)?;
        hash.update(b"DVD-Video");
        hash.update(bytes);
    }
    Ok(OpticalMedium {
        label,
        file_system,
        token: format!("{:x}", hash.finalize()),
        kind: if bluray {
            OpticalKind::Bluray
        } else if dvd {
            OpticalKind::DvdVideo
        } else {
            OpticalKind::Other
        },
        playlists,
        tracks: Vec::new(),
        // Directory presence is not a claim of successful decryption or BD-J support.
        aacs_directory: root.join("AACS").is_dir(),
        bdplus_directory: root.join("BDSVM").is_dir(),
        java_directory: root.join("BDMV").join("JAR").is_dir(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dvd_index_identifies_medium_and_content_changes_invalidate_token() {
        // Explicitly retained synthetic files. No physical optical drive involved.
        let root = std::env::temp_dir().join(format!(
            "discatelier-dvd-structure-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("VIDEO_TS")).unwrap();
        let index = root.join("VIDEO_TS").join("VIDEO_TS.IFO");
        std::fs::write(&index, b"synthetic index one").unwrap();
        let read = || inspect(&root, "Fixture".into(), "Fixture".into(), 123).unwrap();
        let first = read();
        assert!(matches!(first.kind, OpticalKind::DvdVideo));
        assert!(first.playlists.is_empty());
        assert_eq!(first.token, read().token);
        std::fs::write(&index, b"synthetic index two").unwrap();
        assert_ne!(first.token, read().token);
        assert_ne!(
            read().token,
            inspect(&root, "".into(), "".into(), 456).unwrap().token
        );
    }
}
