use crate::{ExtensionRepository, LibraryRepository, LibraryService};
use discatelier_contracts::{AppError, DiscAlbumLink, LibraryCopy, LibraryQuery, OpticalDisc};
use std::collections::BTreeSet;

// Same documented Discogs position forms as metadata/discTracks.ts. No title
// inference: e.g. A1/B1 and 3.1 do not establish separate physical discs.
fn positive(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|b| b.is_ascii_digit())
        && value.bytes().any(|b| b != b'0')
}
pub(crate) fn disc_key(position: &str) -> Option<String> {
    // Pop Virus prints CD12 / BR1: these are track numbers within each medium.
    for prefix in ["CD", "BR"] {
        if position.strip_prefix(prefix).is_some_and(positive) {
            return Some(prefix.into());
        }
    }
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
impl<R: LibraryRepository + ExtensionRepository> LibraryService<R> {
    fn disc_edition(&self, edition: &str) -> Result<LibraryCopy, AppError> {
        crate::request_id(edition)?;
        for category in ["music", "video"] {
            if let Some(copy) = self
                .repository
                .list(&LibraryQuery {
                    category_id: category.into(),
                    ..Default::default()
                })?
                .into_iter()
                .find(|copy| copy.edition_id == edition)
            {
                return Ok(copy);
            }
        }
        Err(AppError::new("validation", "收藏条目不存在。"))
    }
    pub fn edition_discs(&self, edition: &str) -> Result<Vec<OpticalDisc>, AppError> {
        let copy = self.disc_edition(edition)?;
        let content = self
            .repository
            .edition_content(edition)?
            .unwrap_or_default();
        Ok(crate::optical_discs::for_media(
            &content.tracks,
            &copy.edition.title,
            &copy.edition.media,
        ))
    }
    pub fn disc_albums(&self, edition: &str) -> Result<Vec<DiscAlbumLink>, AppError> {
        crate::request_id(edition)?;
        let keys: BTreeSet<_> = self
            .edition_discs(edition)?
            .into_iter()
            .map(|disc| disc.key)
            .collect();
        Ok(crate::disc_links::resolve(
            &keys.into_iter().collect::<Vec<_>>(),
            &self.repository.disc_albums(edition)?,
            &self.disc_edition(edition)?.edition.media,
        ))
    }
    pub fn save_disc_album(
        &mut self,
        edition: &str,
        revision: i64,
        key: &str,
        album: Option<u64>,
    ) -> Result<(), AppError> {
        crate::request_id(edition)?;
        let keys: BTreeSet<_> = self
            .edition_discs(edition)?
            .into_iter()
            .map(|disc| disc.key)
            .collect();
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
            ("CD12", "CD"),
            ("CD14", "CD"),
            ("BR1", "BR"),
            ("BR04", "BR"),
        ] {
            assert_eq!(disc_key(position).as_deref(), Some(key));
        }
        for position in [
            "A1", "B1", "3.1", "01-2", "PM-1", "AM-1", "2-1-2", "2-1.1.1", "CD0", "BR0", "CD",
            "BR", "cd12", "br1", "BR1extra",
        ] {
            assert_eq!(disc_key(position), None);
        }
    }
}
