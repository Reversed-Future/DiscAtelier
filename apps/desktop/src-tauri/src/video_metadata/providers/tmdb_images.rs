use super::*;
use serde::Deserialize;

pub(super) fn image_url(path: Option<&str>, size: &str) -> String {
    path.filter(|p| {
        p.starts_with('/')
            && !p.starts_with("//")
            && !p.contains("..")
            && !p.contains(['?', '#', '\\', ':'])
            && !p.chars().any(char::is_whitespace)
    })
    .map(|p| format!("https://image.tmdb.org/t/p/{size}{p}"))
    .unwrap_or_default()
}
#[derive(Deserialize)]
struct Image {
    file_path: String,
    width: u32,
    height: u32,
    iso_639_1: Option<String>,
}
#[derive(Deserialize)]
struct Images {
    id: u64,
    posters: Vec<Image>,
    backdrops: Vec<Image>,
}
fn normalize(id: u64, value: Images) -> Result<Vec<VideoImage>, AppError> {
    if value.id != id || value.posters.len() + value.backdrops.len() > 2000 {
        return Err(error("图库所属作品不一致或图片数量超过限制。"));
    }
    let mut seen = std::collections::HashSet::new();
    Ok(value
        .posters
        .into_iter()
        .map(|i| (VideoImageKind::Poster, i))
        .chain(
            value
                .backdrops
                .into_iter()
                .map(|i| (VideoImageKind::Backdrop, i)),
        )
        .filter_map(|(kind, image)| {
            let url = image_url(Some(&image.file_path), "original");
            if url.is_empty() || image.width == 0 || image.height == 0 || !seen.insert(url.clone())
            {
                return None;
            }
            Some(VideoImage {
                kind,
                url,
                preview_url: image_url(Some(&image.file_path), "w500"),
                width: image.width,
                height: image.height,
                language: image.iso_639_1.unwrap_or_default(),
            })
        })
        .collect())
}
pub fn fetch(source: VideoSource, id: u64) -> Result<Vec<VideoImage>, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(error("作品编号无效。"));
    }
    let kind = match source {
        VideoSource::TmdbMovie => "movie",
        VideoSource::TmdbTv => "tv",
        VideoSource::Bangumi => return Ok(vec![]),
    };
    // No language filter: include untranslated posters and backdrops as well.
    normalize(
        id,
        json(tmdb::get_unlocalized(&format!("{kind}/{id}/images"))?)?,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn official_images_preserve_kind_language_and_dimensions() {
        for raw in [
            include_str!("fixtures/tmdb-movie-images.json"),
            include_str!("fixtures/tmdb-tv-images.json"),
        ] {
            let rows = normalize(550, serde_json::from_str(raw).unwrap()).unwrap();
            assert_eq!(rows.len(), 4);
            assert!(matches!(rows[0].kind, VideoImageKind::Poster));
            assert!(matches!(rows[2].kind, VideoImageKind::Backdrop));
            assert!(rows[0].url.contains("/original/"));
            assert!(rows[0].preview_url.contains("/w500/"));
            assert!(rows[0].width > 0);
            assert!(normalize(551, serde_json::from_str(raw).unwrap()).is_err());
        }
    }
    #[test]
    fn invalid_image_paths_and_missing_stills_stay_empty() {
        assert!(image_url(None, "w500").is_empty());
        for value in [
            "//evil.test/x",
            "/../x",
            "/x?secret",
            "/x#hash",
            "https://evil.test/x",
        ] {
            assert!(image_url(Some(value), "w500").is_empty());
        }
    }
}
