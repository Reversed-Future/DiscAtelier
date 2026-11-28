use crate::{
    netease::{cached_album, cached_album_tracks, NeteaseState},
    netease_links::SongState,
};
use discatelier_contracts::{AlbumReplacement, AppError, EditionMusicEdits, TrackAssociationEdit};
use serde::Deserialize;
use std::{collections::HashSet, sync::Arc};
use tauri::{AppHandle, Manager};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MusicLinkSelection {
    albums: Vec<AlbumSelection>,
    tracks: Vec<TrackSelection>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AlbumSelection {
    previous_id: Option<u64>,
    album_id: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TrackSelection {
    position: String,
    title: String,
    song_id: Option<u64>,
}

impl MusicLinkSelection {
    pub fn resolve(self, app: &AppHandle) -> Result<EditionMusicEdits, AppError> {
        if self.albums.len() > 20 || self.tracks.len() > 1000 {
            return Err(AppError::new("validation", "网易云关联数量超出限制。"));
        }
        let albums = app.state::<Arc<NeteaseState>>();
        let songs = app.state::<Arc<SongState>>();
        // A manual choice may come from an album the user then replaces again.
        let selected: HashSet<_> = self.tracks.iter().filter_map(|edit| edit.song_id).collect();
        let preview_tracks = cached_album_tracks(&albums, &selected)?;
        Ok(EditionMusicEdits {
            albums: self
                .albums
                .into_iter()
                .map(|edit| {
                    Ok(AlbumReplacement {
                        previous_id: edit.previous_id,
                        album: cached_album(&albums, edit.album_id)?,
                    })
                })
                .collect::<Result<_, AppError>>()?,
            tracks: self
                .tracks
                .into_iter()
                .map(|edit| {
                    Ok(TrackAssociationEdit {
                        cached_song: edit
                            .song_id
                            .map(|id| {
                                songs
                                    .read(id)
                                    .map(|song| song.or_else(|| preview_tracks.get(&id).cloned()))
                            })
                            .transpose()?
                            .flatten(),
                        position: edit.position,
                        title: edit.title,
                        song_id: edit.song_id,
                    })
                })
                .collect::<Result<_, AppError>>()?,
        })
    }
}
