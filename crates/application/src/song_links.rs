use crate::{ExtensionRepository, LibraryRepository, LibraryService};
use discatelier_contracts::{validate_song_link, AppError, ReleaseTrack, SongLink};

fn count(rows: &[ReleaseTrack], position: &str, title: &str) -> usize {
    rows.iter()
        .map(|t| {
            usize::from(
                t.sub_tracks.is_empty()
                    && t.type_ != "heading"
                    && t.position == position
                    && t.title == title,
            ) + count(&t.sub_tracks, position, title)
        })
        .sum()
}

fn has_tracks(rows: &[ReleaseTrack]) -> bool {
    rows.iter().any(|row| {
        if row.sub_tracks.is_empty() {
            row.type_ != "heading"
        } else {
            has_tracks(&row.sub_tracks)
        }
    })
}

pub trait SongLinkRepository {
    fn song_links(&self, edition: &str) -> Result<Vec<SongLink>, AppError>;
    fn save_song_link(
        &mut self,
        edition: &str,
        revision: i64,
        position: &str,
        title: &str,
        link: Option<&SongLink>,
    ) -> Result<(), AppError>;
}

impl<R: LibraryRepository + ExtensionRepository + SongLinkRepository> LibraryService<R> {
    pub fn song_links(&self, edition: &str) -> Result<Vec<SongLink>, AppError> {
        crate::request_id(edition)?;
        let mut links = self.repository.song_links(edition)?;
        let content = self.repository.edition_content(edition)?;
        if let Some(content) = content.filter(|v| has_tracks(&v.tracks)) {
            links.retain(|l| count(&content.tracks, &l.position, &l.title) == 1);
        } else {
            let albums = self.repository.music_albums(edition)?;
            links.retain(|l| {
                albums
                    .iter()
                    .map(|a| {
                        a.album
                            .tracks
                            .iter()
                            .filter(|t| {
                                a.track_position(&t.disc, t.number) == l.position
                                    && t.title == l.title
                            })
                            .count()
                    })
                    .sum::<usize>()
                    == 1
            });
        }
        Ok(links)
    }
    pub fn save_song_link(
        &mut self,
        edition: &str,
        revision: i64,
        position: &str,
        title: &str,
        link: Option<&SongLink>,
    ) -> Result<(), AppError> {
        crate::request_id(edition)?;
        if revision < 1 {
            return Err(AppError::new("validation", "版本无效。"));
        }
        if let Some(link) = link {
            validate_song_link(link)?;
            if link.position != position || link.title != title {
                return Err(AppError::new("validation", "关联曲目标识不一致。"));
            }
        }
        let content = self.repository.edition_content(edition)?;
        let albums = if content.as_ref().is_none_or(|v| !has_tracks(&v.tracks)) {
            self.repository.music_albums(edition)?
        } else {
            Vec::new()
        };
        let valid = unique_song_row(
            content
                .as_ref()
                .map(|c| c.tracks.as_slice())
                .unwrap_or_default(),
            &albums,
            position,
            title,
        );
        if !valid {
            return Err(AppError::new(
                "conflict",
                "曲目已改变或存在重复，请重新打开详情。",
            ));
        }
        self.repository
            .save_song_link(edition, revision, position, title, link)
    }
}

pub fn unique_song_row(
    rows: &[ReleaseTrack],
    albums: &[discatelier_contracts::LinkedMusicAlbum],
    position: &str,
    title: &str,
) -> bool {
    if has_tracks(rows) {
        return count(rows, position, title) == 1;
    }
    albums
        .iter()
        .flat_map(|entry| entry.album.tracks.iter().map(move |song| (entry, song)))
        .filter(|(entry, song)| {
            entry.track_position(&song.disc, song.number) == position && song.title == title
        })
        .count()
        == 1
}
