use super::*;
use serde::Deserialize;
#[derive(Deserialize)]
struct Episode {
    id: u64,
    name: String,
    name_cn: String,
    sort: f64,
    airdate: String,
    duration: String,
    #[serde(rename = "type")]
    kind: u32,
    #[serde(default)]
    subject_id: Option<u64>,
}
#[derive(Deserialize)]
struct Page {
    total: usize,
    offset: usize,
    data: Vec<Episode>,
}
fn bangumi_pages(
    id: u64,
    mut load: impl FnMut(usize) -> Result<Page, AppError>,
) -> Result<Vec<VideoChapter>, AppError> {
    let mut all = Vec::new();
    loop {
        let page = load(all.len())?;
        if page.offset != all.len()
            || page.total > 5000
            || all.len() + page.data.len() > 5000
            || (page.data.is_empty() && all.len() < page.total)
        {
            return Err(error("章节分页不完整或数量超过限制，请稍后重试。"));
        }
        if page
            .data
            .iter()
            .any(|e| e.subject_id.is_some_and(|subject| subject != id))
        {
            return Err(error("章节所属作品不匹配。"));
        }
        all.extend(page.data);
        if all.len() >= page.total {
            break;
        }
    }
    let mut ids = std::collections::HashSet::new();
    if all.iter().any(|e| !ids.insert(e.id)) {
        return Err(error("章节分页重复，请重新获取。"));
    }
    all.sort_by(|a, b| {
        a.kind
            .cmp(&b.kind)
            .then(a.sort.total_cmp(&b.sort))
            .then(a.id.cmp(&b.id))
    });
    Ok(all
        .into_iter()
        .map(|e| VideoChapter {
            id: e.id,
            episode_kind: Some(e.kind),
            season_number: None,
            group: match e.kind {
                0 => "本篇".into(),
                1 => "特别篇".into(),
                2 => "OP".into(),
                3 => "ED".into(),
                4 => "预告 / 宣传 / 广告".into(),
                5 => "MAD".into(),
                6 => "其他".into(),
                n => format!("类型 {n}"),
            },
            number: e.sort.to_string(),
            title: if e.name_cn.trim().is_empty() {
                e.name.clone()
            } else {
                e.name_cn
            },
            original_title: e.name,
            air_date: e.airdate,
            duration: e.duration,
            summary: String::new(),
            image_url: String::new(),
        })
        .collect())
}
#[derive(Deserialize)]
struct SeasonRef {
    season_number: u32,
}
#[derive(Deserialize)]
struct Series {
    id: u64,
    seasons: Vec<SeasonRef>,
}
#[derive(Deserialize)]
struct TvEpisode {
    id: u64,
    name: String,
    episode_number: u32,
    season_number: u32,
    #[serde(default)]
    show_id: Option<u64>,
    air_date: Option<String>,
    runtime: Option<u32>,
    overview: Option<String>,
    still_path: Option<String>,
}
#[derive(Deserialize)]
struct Season {
    season_number: u32,
    name: String,
    episodes: Vec<TvEpisode>,
}
fn season_rows(id: u64, number: u32, season: Season) -> Result<Vec<VideoChapter>, AppError> {
    if season.season_number != number
        || season
            .episodes
            .iter()
            .any(|e| e.season_number != number || e.show_id.is_some_and(|show| show != id))
    {
        return Err(error("分集所属剧集或季不匹配。"));
    }
    let group = if season.name.is_empty() {
        format!("第 {number} 季")
    } else {
        season.name
    };
    let mut episodes = season.episodes;
    episodes.sort_by_key(|e| e.episode_number);
    Ok(episodes
        .into_iter()
        .map(|e| VideoChapter {
            id: e.id,
            episode_kind: None,
            season_number: Some(e.season_number),
            group: group.clone(),
            number: e.episode_number.to_string(),
            title: e.name.clone(),
            original_title: e.name,
            air_date: e.air_date.unwrap_or_default(),
            summary: e.overview.unwrap_or_default(),
            image_url: super::tmdb_images::image_url(e.still_path.as_deref(), "w500"),
            duration: e
                .runtime
                .filter(|n| *n > 0)
                .map(|n| format!("{n} 分钟"))
                .unwrap_or_default(),
        })
        .collect())
}
pub fn fetch(source: VideoSource, id: u64) -> Result<Vec<VideoChapter>, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(error("作品编号无效。"));
    }
    match source {
        VideoSource::Bangumi => bangumi_pages(id, |offset| {
            json(bangumi::auth(
                client()?.get("https://api.bgm.tv/v0/episodes").query(&[
                    ("subject_id", id.to_string()),
                    ("limit", "100".into()),
                    ("offset", offset.to_string()),
                ]),
            )?)
        }),
        VideoSource::TmdbMovie => Ok(vec![]),
        VideoSource::TmdbTv => {
            let series: Series = json(tmdb::get(&format!("tv/{id}"))?)?;
            if series.id != id || series.seasons.len() > 100 {
                return Err(error("剧集编号无效或季数超过读取限制。"));
            }
            let mut refs = series.seasons;
            refs.sort_by_key(|s| s.season_number);
            let mut rows = Vec::new();
            for season in refs {
                rows.extend(season_rows(
                    id,
                    season.season_number,
                    json(tmdb::get(&format!(
                        "tv/{id}/season/{}",
                        season.season_number
                    ))?)?,
                )?);
                if rows.len() > 5000 {
                    return Err(error("章节数量超过读取限制。"));
                }
            }
            Ok(rows)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_yosuga_response_has_all_twelve_episodes() {
        let rows = bangumi_pages(7157, |_| {
            Ok(serde_json::from_str(include_str!("fixtures/bangumi-episodes.json")).unwrap())
        })
        .unwrap();
        assert_eq!(rows.len(), 12);
        assert_eq!(rows[0].episode_kind, Some(0));
        assert_eq!(rows[0].season_number, None);
        assert_eq!(rows[0].title, "悠远的记忆");
        assert_eq!(rows[0].original_title, "ハルカナキオク");
        assert_eq!(rows[0].duration, "00:26:00");
        assert_eq!(rows[11].number, "12");
    }
    #[test]
    fn pagination_uses_offset_and_rejects_partial_or_foreign_rows() {
        let full: Page =
            serde_json::from_str(include_str!("fixtures/bangumi-episodes.json")).unwrap();
        let mut rows = full.data.into_iter();
        let mut offsets = Vec::new();
        let got = bangumi_pages(7157, |offset| {
            offsets.push(offset);
            Ok(Page {
                total: 12,
                offset,
                data: rows.by_ref().take(5).collect(),
            })
        })
        .unwrap();
        assert_eq!(offsets, [0, 5, 10]);
        assert_eq!(got.len(), 12);
        assert!(bangumi_pages(7157, |offset| Ok(Page {
            total: 12,
            offset,
            data: vec![]
        }))
        .is_err());
        assert!(bangumi_pages(1, |_| Ok(serde_json::from_str(include_str!(
            "fixtures/bangumi-episodes.json"
        ))
        .unwrap()))
        .is_err());
    }
    #[test]
    fn tmdb_season_example_maps_chapters_and_checks_identity() {
        let raw = include_str!("fixtures/tmdb-season.json");
        let rows = season_rows(1399, 1, serde_json::from_str(raw).unwrap()).unwrap();
        assert_eq!(rows.len(), 10);
        assert_eq!(rows[0].season_number, Some(1));
        assert_eq!(rows[0].episode_kind, None);
        assert_eq!(rows[0].title, "Winter Is Coming");
        assert_eq!(rows[0].duration, "62 分钟");
        assert!(rows[0].summary.starts_with("Jon Arryn"));
        assert!(rows[0]
            .image_url
            .ends_with("9hGF3WUkBf7cSjMg0cdMDHJkByd.jpg"));
        assert!(season_rows(1399, 2, serde_json::from_str(raw).unwrap()).is_err());
    }
}
