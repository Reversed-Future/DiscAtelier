use super::host::public_item;
use discatelier_agent_harness::tools::{CopyEntries, EntrySection};
use discatelier_application::{physical_discs, physical_track_rows, LibraryService};
use discatelier_contracts::*;
use discatelier_integration_http::error;
use discatelier_storage::SqliteLibrary;
use serde_json::{json, Value};

type Library = LibraryService<SqliteLibrary>;

fn excerpt(value: &str, n: usize) -> String {
    let mut chars = value.chars();
    let mut result: String = chars.by_ref().take(n).collect();
    if chars.next().is_some() {
        result.push('…');
    }
    result
}

pub(super) fn listing(item: &LibraryCopy) -> Value {
    json!({"id":item.id,"editionId":item.edition_id,"title":excerpt(&item.edition.title,180),
        "creator":excerpt(&item.edition.creator,160),"editionLabel":excerpt(&item.edition.edition_label,180),
        "category":item.edition.category_id,"status":item.copy.status,"revision":item.revision,"coverAssetId":item.cover_asset_id})
}

pub(super) fn edition_listing(item: &LibraryCopy) -> Value {
    let full = public_item(item);
    if full.to_string().len() <= 8_000 {
        full
    } else {
        let mut summary = listing(item);
        summary["barcode"] = json!(item.edition.barcode);
        summary["catalogNumber"] = json!(item.edition.catalog_number);
        summary["discCount"] = json!(item.edition.media.len());
        summary
    }
}

pub(super) fn page<T>(rows: &[T], offset: usize, project: impl Fn(&T) -> Value) -> Value {
    let mut items = Vec::new();
    let mut bytes = 0;
    for row in rows.iter().skip(offset).take(30) {
        let value = project(row);
        bytes += value.to_string().len();
        if bytes > 24_000 && !items.is_empty() {
            break;
        }
        items.push(value);
    }
    let end = offset.saturating_add(items.len());
    let next = (end < rows.len()).then_some(end);
    json!({"items":items,"count":rows.len(),"offset":offset,"nextOffset":next,"truncated":next.is_some()})
}

fn work_summary(index: usize, work: &VideoWork) -> Value {
    json!({"workIndex":index,"source":work.source,"externalId":work.external_id,
        "title":excerpt(&work.title,180),"originalTitle":excerpt(&work.original_title,180),
        "summary":excerpt(&work.summary,400),"premiereDate":work.premiere_date,"episodeCount":work.episode_count,
        "chapters":work.chapters.as_ref().map(Vec::len),"characters":work.characters.len(),"people":work.people.len()})
}

pub(super) fn details(s: &Library, item: &LibraryCopy) -> Result<Value, AppError> {
    let id = &item.edition_id;
    let content = s.edition_content(id)?;
    if item.edition.category_id == "video" {
        let video = s.video_metadata(id)?.unwrap_or_default();
        let works: Vec<_> = video
            .work
            .iter()
            .chain(&video.additional_works)
            .enumerate()
            .map(|(index, work)| work_summary(index, work))
            .collect();
        let p = &video.physical;
        let physical = json!({"territory":excerpt(&p.territory,100),"releaseDate":p.release_date,
            "volume":excerpt(&p.volume,160),"includedContent":excerpt(&p.included_content,800),"packaging":excerpt(&p.packaging,240)});
        let mut result = json!({"copy":edition_listing(item),"video":{"works":works,"parts":video.parts,"physical":physical,
            "manualChapterLinkCount":video.chapter_links.len()},"physicalTrackCount":content.as_ref().map(|c|physical_track_rows(&c.tracks,item.edition.media.len()).len()).unwrap_or(0),
            "content":content});
        if result.to_string().len() > 30_000 {
            result.as_object_mut().unwrap().remove("content");
            result["truncated"] = json!(true);
            result["readMore"] = json!("get_copy_entries");
        }
        return Ok(result);
    }
    let albums = s.music_albums(id)?;
    let song_links = s.song_links(id)?;
    let disc_links = s.disc_albums(id)?;
    let full = json!({"copy":public_item(item),"content":content,"netease":s.supplement(id)?,
        "neteaseAlbums":albums,"discAlbumLinks":disc_links,"songLinks":song_links});
    if full.to_string().len() <= 30_000 {
        return Ok(full);
    }
    let album_summaries: Vec<_> = albums
        .iter()
        .map(|a| {
            json!({"albumId":a.album.album_id,
        "title":excerpt(&a.album.title,120),"trackCount":a.album.tracks.len()})
        })
        .collect();
    Ok(
        json!({"copy":edition_listing(item),"truncated":true,"albums":album_summaries,
        "discAlbumLinks":disc_links,"songLinkCount":song_links.len(),"readMore":"get_copy_entries"}),
    )
}

fn song(row: &SupplementTrack) -> Value {
    json!({"id":row.id,"title":excerpt(&row.title,200),"disc":row.disc,"number":row.number,"durationMs":row.duration_ms,
        "artists":row.artists.iter().take(12).map(|a|excerpt(a,80)).collect::<Vec<_>>()})
}

pub(super) fn entries(
    s: &Library,
    item: &LibraryCopy,
    args: &CopyEntries,
) -> Result<Value, AppError> {
    let id = &item.edition_id;
    match args.section {
        EntrySection::Media => {
            let media: Vec<_> = item.edition.media.iter().enumerate().collect();
            Ok(page(&media, args.offset, |(index, disc)| {
                json!({
                    "discNumber":index + 1,"carrierId":disc.carrier_id,"label":disc.label
                })
            }))
        }
        EntrySection::Credits => {
            let content = s.edition_content(id)?.unwrap_or_default();
            let tracks = physical_track_rows(&content.tracks, item.edition.media.len());
            let mut credits: Vec<_> = content.credits.iter().map(|c| (None, c)).collect();
            for (track, key, _, _) in &tracks {
                credits.extend(track.extraartists.iter().map(|c| (Some((track, key)), c)));
            }
            Ok(page(&credits, args.offset, |(track, credit)| {
                json!({
                    "name":excerpt(&credit.name,180),"alias":excerpt(&credit.anv,180),
                    "role":excerpt(&credit.role,240),"tracks":excerpt(&credit.tracks,500),
                    "track":track.map(|(t, key)| json!({"discKey":key,"position":excerpt(&t.position,100),"title":excerpt(&t.title,250)}))
                })
            }))
        }
        EntrySection::PhysicalTracks => {
            let content = s.edition_content(id)?.unwrap_or_default();
            let rows = physical_track_rows(&content.tracks, item.edition.media.len());
            Ok(page(&rows, args.offset, |(track, key, heading, _)| {
                let number = physical_discs::number(
                    key.as_deref().unwrap_or("unassigned"),
                    &item.edition.media,
                );
                json!({"discNumber":number,"discKey":key,"heading":heading,"headingKind":track.heading_kind,
                    "position":excerpt(&track.position,100),"title":excerpt(&track.title,250),"duration":excerpt(&track.duration,50)})
            }))
        }
        EntrySection::SongLinks | EntrySection::AlbumTracks
            if item.edition.category_id != "music" =>
        {
            Err(error("这份收藏不是音乐版本。"))
        }
        EntrySection::SongLinks => Ok(page(
            &s.song_links(id)?,
            args.offset,
            |link| json!({"position":excerpt(&link.position,100),"title":excerpt(&link.title,200),"song":song(&link.song)}),
        )),
        EntrySection::AlbumTracks => {
            let album = s
                .music_albums(id)?
                .into_iter()
                .find(|a| Some(a.album.album_id) == args.album_id)
                .ok_or_else(|| error("请使用这份收藏实际关联的 albumId。"))?;
            Ok(page(&album.album.tracks, args.offset, song))
        }
        _ => {
            let video = s
                .video_metadata(id)?
                .ok_or_else(|| error("这份收藏没有已保存的作品资料。"))?;
            let index = args
                .work_index
                .ok_or_else(|| error("请先读取 get_copy，并指定其中的 workIndex。"))?;
            let work = video
                .work
                .iter()
                .chain(&video.additional_works)
                .nth(index)
                .ok_or_else(|| error("作品来源不存在。"))?;
            let mut result = match args.section {
                EntrySection::Chapters => page(
                    work.chapters.as_deref().unwrap_or_default(),
                    args.offset,
                    |c| {
                        json!({"id":c.id,"group":excerpt(&c.group,100),"number":c.number,"title":excerpt(&c.title,240),
                        "originalTitle":excerpt(&c.original_title,240),"airDate":c.air_date,"duration":c.duration,"summary":excerpt(&c.summary,600)})
                    },
                ),
                EntrySection::People => page(
                    &work.people,
                    args.offset,
                    |p| json!({"name":excerpt(&p.name,180),"role":excerpt(&p.role,180)}),
                ),
                EntrySection::Characters => page(&work.characters, args.offset, |c| {
                    json!({
                        "name":excerpt(&c.name,180),"role":excerpt(&c.role,120),"actors":c.actors.iter().take(16).map(|n|excerpt(n,100)).collect::<Vec<_>>(),
                        "facts":c.facts.iter().take(12).map(|f|json!({"label":excerpt(&f.label,80),
                            "values":f.values.iter().take(4).map(|v|excerpt(&v.text,80)).collect::<Vec<_>>() })).collect::<Vec<_>>(),"factCount":c.facts.len()
                    })
                }),
                _ => unreachable!(),
            };
            result["source"] = json!(work.source);
            result["workIndex"] = json!(index);
            Ok(result)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_continue_at_first_unseen_row_under_count_and_byte_limits() {
        let rows: Vec<_> = (0..65).collect();
        for (width, first_page_count) in [(0, 30), (2_000, 11)] {
            let mut seen = Vec::new();
            let mut offset = 0;
            loop {
                let result = page(
                    &rows,
                    offset,
                    |id| json!({"id":id,"title":"x".repeat(width)}),
                );
                let items = result["items"].as_array().unwrap();
                if offset == 0 {
                    assert_eq!(items.len(), first_page_count);
                }
                assert_eq!(result["count"], 65);
                seen.extend(items.iter().map(|v| v["id"].as_u64().unwrap()));
                match result["nextOffset"].as_u64() {
                    Some(next) => offset = next as usize,
                    None => break,
                }
            }
            assert_eq!(seen, rows);
        }
        let past_end = page(&rows, usize::MAX, |id| json!(id));
        assert_eq!(past_end["items"], json!([]));
        assert!(past_end["nextOffset"].is_null());
    }
}
