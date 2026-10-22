mod parts;
use crate::AppError;
pub use parts::VideoPart;
use serde::{Deserialize, Serialize};

/// Internal normalized fields; provider JSON is mapped explicitly by its adapter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoSource {
    TmdbMovie,
    TmdbTv,
    Bangumi,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoPerson {
    pub name: String,
    pub role: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoFactValue {
    pub text: String,
    pub url: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoFact {
    pub label: String,
    pub values: Vec<VideoFactValue>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoActorPortrait {
    pub name: String,
    pub portrait_url: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoCharacter {
    pub name: String,
    pub role: String,
    pub actors: Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub portrait_url: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub facts: Vec<VideoFact>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub actor_portraits: Vec<VideoActorPortrait>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoChapter {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode_kind: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub season_number: Option<u32>,
    pub group: String,
    pub number: String,
    pub title: String,
    pub original_title: String,
    pub air_date: String,
    pub duration: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub summary: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub image_url: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum VideoImageKind {
    Poster,
    Backdrop,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoImage {
    pub kind: VideoImageKind,
    pub url: String,
    pub preview_url: String,
    pub width: u32,
    pub height: u32,
    pub language: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoWork {
    pub source: VideoSource,
    pub external_id: u64,
    pub title: String,
    pub original_title: String,
    pub summary: String,
    pub premiere_date: String,
    pub poster_url: String,
    pub episode_count: Option<u32>,
    pub genres: Vec<String>,
    pub people: Vec<VideoPerson>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub facts: Vec<VideoFact>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub characters: Vec<VideoCharacter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapters: Option<Vec<VideoChapter>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<VideoImage>>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoEditionDetails {
    pub territory: String,
    pub release_date: String,
    pub volume: String,
    pub included_content: String,
    pub packaging: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoMetadata {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub parts: Vec<VideoPart>,
    pub work: Option<VideoWork>,
    pub physical: VideoEditionDetails,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub additional_works: Vec<VideoWork>,
}

pub fn validate_video(value: &VideoMetadata) -> Result<(), AppError> {
    let bounded = |v: &str, max: usize| v.len() <= max && !v.contains('\0');
    let p = &value.physical;
    let valid_physical = [&p.territory, &p.release_date, &p.volume, &p.packaging]
        .iter()
        .all(|s| bounded(s, 2000))
        && bounded(&p.included_content, 20000);
    let works: Vec<_> = value
        .work
        .iter()
        .chain(value.additional_works.iter())
        .collect();
    let unique = works.iter().enumerate().all(|(i, w)| {
        !works[..i]
            .iter()
            .any(|other| other.source == w.source && other.external_id == w.external_id)
    });
    let valid_work = works.len() <= 8
        && (value.work.is_some() || value.additional_works.is_empty())
        && unique
        && works.iter().all(|w| {
            w.external_id > 0
                && w.external_id <= 9_007_199_254_740_991
                && !w.title.trim().is_empty()
                && [&w.title, &w.original_title, &w.premiere_date, &w.poster_url]
                    .iter()
                    .all(|s| bounded(s, 2000))
                && bounded(&w.summary, 100000)
                && w.genres.len() <= 100
                && w.genres.iter().all(|s| bounded(s, 1000))
                && w.people.len() <= 500
                && w.people
                    .iter()
                    .all(|p| bounded(&p.name, 2000) && bounded(&p.role, 2000))
                && w.facts.len() <= 100
                && w.facts.iter().all(|f| {
                    bounded(&f.label, 200)
                        && f.values.len() <= 100
                        && f.values
                            .iter()
                            .all(|v| bounded(&v.text, 4000) && bounded(&v.url, 2000))
                })
                && w.characters.len() <= 500
                && w.characters.iter().all(|c| {
                    bounded(&c.name, 2000)
                        && bounded(&c.portrait_url, 2000)
                        && bounded(&c.role, 2000)
                        && c.actors.len() <= 100
                        && c.actors.iter().all(|a| bounded(a, 2000))
                        && c.actor_portraits.len() <= 100
                        && c.actor_portraits
                            .iter()
                            .all(|a| bounded(&a.name, 2000) && bounded(&a.portrait_url, 2000))
                        && c.facts.len() <= 100
                        && c.facts.iter().all(|f| {
                            bounded(&f.label, 200)
                                && f.values.len() <= 100
                                && f.values
                                    .iter()
                                    .all(|v| bounded(&v.text, 4000) && bounded(&v.url, 2000))
                        })
                })
                && w.images.as_ref().is_none_or(|images| {
                    images.len() <= 2000
                        && images.iter().all(|image| {
                            bounded(&image.url, 2000)
                                && bounded(&image.preview_url, 2000)
                                && bounded(&image.language, 100)
                                && image.width > 0
                                && image.height > 0
                                && image.width <= 100000
                                && image.height <= 100000
                        })
                })
                && w.chapters.as_ref().is_none_or(|rows| {
                    rows.len() <= 5000
                        && rows.iter().all(|c| {
                            bounded(&c.summary, 100000)
                                && bounded(&c.image_url, 2000)
                                && c.id > 0
                                && c.id <= 9_007_199_254_740_991
                                && [
                                    &c.group,
                                    &c.number,
                                    &c.title,
                                    &c.original_title,
                                    &c.air_date,
                                    &c.duration,
                                ]
                                .iter()
                                .all(|s| bounded(s, 2000))
                        })
                })
        });
    if !valid_physical || !valid_work || !parts::valid(value) {
        return Err(AppError::new("validation", "作品或实体版本资料无效。"));
    }
    Ok(())
}
