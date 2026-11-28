use crate::{content, db_error, music_albums, song_links};
use discatelier_application::unique_song_row;
use discatelier_contracts::{
    validate_song_link, AlbumReplacement, AppError, EditionMusicEdits, LinkedMusicAlbum, SongLink,
};
use rusqlite::{params, Transaction};

fn conflict() -> AppError {
    AppError::new("conflict", "当前关联已改变，请重新打开编辑窗口。")
}

fn replace_album(
    tx: &Transaction<'_>,
    edition: &str,
    albums: &mut Vec<LinkedMusicAlbum>,
    edit: &AlbumReplacement,
) -> Result<(), AppError> {
    let next = edit.album.album_id;
    if albums.iter().any(|a| a.album.album_id == next) {
        return Err(conflict());
    }
    let previous = edit.previous_id;
    let slot = match previous {
        Some(id) => albums
            .iter()
            .position(|a| a.album.album_id == id)
            .ok_or_else(conflict)?,
        None if albums.is_empty() => 0,
        None => return Err(conflict()),
    };
    let entry = LinkedMusicAlbum {
        album: edit.album.clone(),
        legacy_positions: albums.get(slot).is_some_and(|a| a.legacy_positions),
    };
    let raw = serde_json::to_string(&entry.album)
        .map_err(|_| AppError::new("storage", "专辑关联不可保存。"))?;
    tx.execute("INSERT INTO edition_music_albums (edition_id,album_id,ordinal,legacy_positions,payload) VALUES (?1,?2,COALESCE((SELECT ordinal FROM edition_music_albums WHERE edition_id=?1 AND album_id=?3),0),?4,?5)",
        params![edition, next as i64, previous.map(|id| id as i64), entry.legacy_positions, raw]).map_err(db_error)?;
    if let Some(id) = previous {
        tx.execute(
            "UPDATE edition_disc_albums SET album_id=?1 WHERE edition_id=?2 AND album_id=?3",
            params![next as i64, edition, id as i64],
        )
        .map_err(db_error)?;
        tx.execute(
            "DELETE FROM edition_music_albums WHERE edition_id=?1 AND album_id=?2",
            params![edition, id as i64],
        )
        .map_err(db_error)?;
        albums[slot] = entry;
    } else {
        albums.push(entry);
    }
    Ok(())
}

pub(super) fn apply(
    tx: &Transaction<'_>,
    edition: &str,
    edits: &EditionMusicEdits,
) -> Result<(), AppError> {
    let mut albums = music_albums::read(tx, edition)?;
    let mut songs = std::collections::HashMap::new();
    let selected: std::collections::HashSet<_> =
        edits.tracks.iter().filter_map(|e| e.song_id).collect();
    for song in albums
        .iter()
        .flat_map(|a| &a.album.tracks)
        .filter(|s| selected.contains(&s.id))
    {
        songs.insert(song.id, song.clone());
    }
    for edit in &edits.albums {
        replace_album(tx, edition, &mut albums, edit)?;
    }
    music_albums::validate_albums(&albums)?;
    if edits.tracks.is_empty() {
        return Ok(());
    }
    let rows = content::read(tx, edition)?.unwrap_or_default().tracks;
    for edit in &edits.tracks {
        if !unique_song_row(&rows, &albums, &edit.position, &edit.title) {
            return Err(AppError::new(
                "conflict",
                format!("曲目「{}」已改变或重复，请重新核对单曲关联。", edit.title),
            ));
        }
        let link = if let Some(id) = edit.song_id {
            let song = edit
                .cached_song
                .as_ref()
                .filter(|song| song.id == id)
                .or_else(|| {
                    albums
                        .iter()
                        .flat_map(|a| &a.album.tracks)
                        .find(|s| s.id == id)
                })
                .or_else(|| songs.get(&id))
                .ok_or_else(|| AppError::new("netease", "歌曲预览已过期，请重新读取歌曲链接。"))?;
            let link = SongLink {
                position: edit.position.clone(),
                title: edit.title.clone(),
                song: song.clone(),
            };
            validate_song_link(&link)?;
            Some(link)
        } else {
            None
        };
        song_links::write(tx, edition, &edit.position, &edit.title, link.as_ref())?;
    }
    Ok(())
}
