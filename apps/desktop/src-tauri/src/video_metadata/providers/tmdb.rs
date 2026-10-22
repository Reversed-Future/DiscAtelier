use super::*;
use serde::Deserialize;
#[derive(Deserialize)]
struct Named {
    name: String,
}
#[derive(Deserialize)]
struct Work {
    id: u64,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    original_title: Option<String>,
    #[serde(default)]
    original_name: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    #[serde(default)]
    release_date: Option<String>,
    #[serde(default)]
    first_air_date: Option<String>,
    #[serde(default)]
    number_of_episodes: Option<u32>,
    #[serde(default)]
    genres: Vec<Named>,
}
#[derive(Deserialize)]
struct Page {
    results: Vec<Work>,
    total_pages: u32,
}
fn kind(source: VideoSource) -> &'static str {
    if source == VideoSource::TmdbMovie {
        "movie"
    } else {
        "tv"
    }
}
pub(super) fn get(path: &str) -> Result<RequestBuilder, AppError> {
    Ok(get_unlocalized(path)?.query(&[("language", "zh-CN")]))
}
pub(super) fn get_unlocalized(path: &str) -> Result<RequestBuilder, AppError> {
    let token = settings::token("tmdb")?
        .ok_or_else(|| error("请先在设置 → 影像资料中填写 TMDB API Read Access Token。"))?;
    Ok(client()?
        .get(format!("https://api.themoviedb.org/3/{path}"))
        .bearer_auth(token))
}
fn normalize(work: Work, source: VideoSource) -> VideoWork {
    let movie = source == VideoSource::TmdbMovie;
    let original = if movie {
        work.original_title
    } else {
        work.original_name
    }
    .unwrap_or_default();
    let title = if movie { work.title } else { work.name }
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| original.clone());
    let poster = work
        .poster_path
        .filter(|s| s.starts_with('/') && !s.contains("..") && !s.contains('?') && !s.contains('#'))
        .map(|s| format!("https://image.tmdb.org/t/p/w500{s}"))
        .unwrap_or_default();
    VideoWork {
        source,
        external_id: work.id,
        title,
        original_title: original,
        summary: work.overview.unwrap_or_default(),
        premiere_date: if movie {
            work.release_date
        } else {
            work.first_air_date
        }
        .unwrap_or_default(),
        poster_url: poster,
        episode_count: work.number_of_episodes.filter(|n| *n > 0),
        genres: work.genres.into_iter().map(|g| g.name).collect(),
        people: vec![],
        facts: vec![],
        characters: vec![],
        chapters: None,
        images: None,
    }
}
pub(super) fn search(source: VideoSource, query: &str, page: u32) -> Result<SearchPage, AppError> {
    let value: Page = json(
        get(&format!("search/{}", kind(source)))?
            .query(&[("query", query), ("page", &page.to_string())]),
    )?;
    Ok(SearchPage {
        items: value
            .results
            .into_iter()
            .map(|w| normalize(w, source))
            .collect(),
        page,
        has_more: page < value.total_pages.min(500),
    })
}
pub(super) fn detail(source: VideoSource, id: u64) -> Result<VideoWork, AppError> {
    let path = format!("{}/{id}", kind(source));
    Ok(normalize(json(get(&path)?)?, source))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn official_examples_map_movie_and_tv_without_equating_episode_count_to_discs() {
        let movie = normalize(
            serde_json::from_str(include_str!("fixtures/tmdb-movie.json")).unwrap(),
            VideoSource::TmdbMovie,
        );
        assert!(!movie.title.is_empty());
        assert_eq!(movie.episode_count, None);
        assert!(movie.poster_url.starts_with("https://image.tmdb.org/"));
        let tv = normalize(
            serde_json::from_str(include_str!("fixtures/tmdb-tv.json")).unwrap(),
            VideoSource::TmdbTv,
        );
        assert!(!tv.title.is_empty());
        assert!(tv.episode_count.is_some());
        assert!(tv.characters.is_empty());
        assert!(movie.characters.is_empty());
    }
}
