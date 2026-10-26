use crate::{ExtensionRepository, LibraryRepository, LibraryService};
use discatelier_contracts::{AppError, DiscAlbumLink, ReleaseTrack};
use std::collections::BTreeSet;

// Same documented Discogs position forms as metadata/discTracks.ts. No title
// inference: e.g. A1/B1 and 3.1 do not establish separate physical discs.
fn positive(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|b| b.is_ascii_digit())
        && value.bytes().any(|b| b != b'0')
}
pub(crate) fn disc_key(position: &str) -> Option<String> {
    let (left, right) = position.split_once('-')?;
    let mut parts = right.split('.');
    if !positive(parts.next()?)
        || parts
            .clone()
            .any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
        || parts.count() > 1
    {
        return None;
    }
    if left == "CD" || left == "DVD" || left == "BD" {
        return Some(left.into());
    }
    let number = left
        .strip_prefix("CD")
        .or_else(|| left.strip_prefix("DVD"))
        .or_else(|| left.strip_prefix("BD"))
        .unwrap_or(left);
    (positive(number) && !number.starts_with('0')).then(|| left.into())
}
fn collect_keys(rows: &[ReleaseTrack], parent: Option<&str>, keys: &mut BTreeSet<String>) {
    for track in rows {
        let key = disc_key(&track.position).or_else(|| parent.map(str::to_owned));
        if track.sub_tracks.is_empty() {
            if track.type_ != "heading" {
                keys.insert(key.unwrap_or_else(|| "unassigned".into()));
            }
        } else {
            collect_keys(&track.sub_tracks, key.as_deref(), keys);
        }
    }
}
impl<R: LibraryRepository + ExtensionRepository> LibraryService<R> {
    pub fn disc_albums(&self, edition: &str) -> Result<Vec<DiscAlbumLink>, AppError> {
        crate::request_id(edition)?;
        let mut keys = BTreeSet::new();
        if let Some(content) = self.repository.edition_content(edition)? {
            collect_keys(&content.tracks, None, &mut keys);
        }
        Ok(self
            .repository
            .disc_albums(edition)?
            .into_iter()
            .filter(|l| keys.contains(&l.disc_key))
            .collect())
    }
    pub fn save_disc_album(
        &mut self,
        edition: &str,
        revision: i64,
        key: &str,
        album: Option<u64>,
    ) -> Result<(), AppError> {
        crate::request_id(edition)?;
        let mut keys = BTreeSet::new();
        if let Some(content) = self.repository.edition_content(edition)? {
            collect_keys(&content.tracks, None, &mut keys);
        }
        if revision < 1
            || !keys.contains(key)
            || album.is_some_and(|id| {
                !self
                    .repository
                    .music_albums(edition)
                    .is_ok_and(|albums| albums.iter().any(|a| a.album.album_id == id))
            })
        {
            return Err(AppError::new(
                "validation",
                "实体分盘或关联专辑已改变，请重新打开资料。",
            ));
        }
        self.repository
            .save_disc_album(edition, revision, key, album)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_discogs_positions_only() {
        for (position, key) in [
            ("1-01", "1"),
            ("CD2-3", "CD2"),
            ("DVD-14", "DVD"),
            ("2-1.1", "2"),
            ("BD1-13", "BD1"),
            ("BD2-1", "BD2"),
            ("BD-1.1", "BD"),
        ] {
            assert_eq!(disc_key(position).as_deref(), Some(key));
        }
        for position in [
            "A1", "B1", "3.1", "01-2", "PM-1", "AM-1", "2-1-2", "2-1.1.1",
        ] {
            assert_eq!(disc_key(position), None);
        }
    }
}
