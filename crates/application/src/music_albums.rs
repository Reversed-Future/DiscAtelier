use crate::{ExtensionRepository, LibraryRepository, LibraryService};
use discatelier_contracts::{AppError, LinkedMusicAlbum};

impl<R: LibraryRepository + ExtensionRepository> LibraryService<R> {
    pub fn music_albums(&self, edition: &str) -> Result<Vec<LinkedMusicAlbum>, AppError> {
        crate::request_id(edition)?;
        self.repository.music_albums(edition)
    }
    pub fn reorder_music_albums(
        &mut self,
        edition: &str,
        revision: i64,
        ids: &[u64],
    ) -> Result<(), AppError> {
        let mut albums = self.music_albums(edition)?;
        if revision < 1
            || ids.len() != albums.len()
            || ids.iter().enumerate().any(|(i, id)| {
                ids[..i].contains(id) || !albums.iter().any(|a| a.album.album_id == *id)
            })
        {
            return Err(AppError::new(
                "validation",
                "关联专辑已改变，请重新打开资料。",
            ));
        }
        albums.sort_by_key(|a| ids.iter().position(|id| *id == a.album.album_id));
        self.repository
            .write_music_albums(edition, revision, &albums)
    }
    pub fn remove_music_album(
        &mut self,
        edition: &str,
        revision: i64,
        id: u64,
    ) -> Result<(), AppError> {
        let mut albums = self.music_albums(edition)?;
        if revision < 1 || !albums.iter().any(|a| a.album.album_id == id) {
            return Err(AppError::new(
                "validation",
                "关联专辑已改变，请重新打开资料。",
            ));
        }
        albums.retain(|a| a.album.album_id != id);
        // Independent per-track links remain untouched, even when their album is removed.
        self.repository
            .write_music_albums(edition, revision, &albums)
    }
}
