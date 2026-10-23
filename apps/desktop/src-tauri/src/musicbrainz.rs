use discatelier_contracts::AppError;
use discatelier_integration_http::{error, request};
use serde::{Deserialize, Serialize};

const DEFAULT_BASE: &str = "https://musicbrainz.org/ws/2";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscRelease {
    pub release_id: String,
    pub title: String,
    pub artist: String,
    pub date: String,
    pub country: String,
}

#[derive(Deserialize)]
struct Response {
    #[serde(default)]
    releases: Vec<RawRelease>,
}

#[derive(Deserialize)]
struct RawRelease {
    id: String,
    title: String,
    #[serde(default)]
    date: String,
    #[serde(default)]
    country: String,
    #[serde(rename = "artist-credit", default)]
    artist_credit: Vec<RawCredit>,
}

#[derive(Deserialize)]
struct RawCredit {
    #[serde(default)]
    name: String,
}

fn validate_id(disc_id: &str) -> Result<(), AppError> {
    if disc_id.is_empty()
        || disc_id.len() > 64
        || !disc_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '.' | '_' | '-'))
    {
        return Err(error("MusicBrainz CD ID 无效。"));
    }
    Ok(())
}

fn lookup(base: &str, disc_id: &str) -> Result<Vec<DiscRelease>, AppError> {
    let route = format!("discid/{disc_id}");
    let value = request(
        base,
        &route,
        &[("fmt", "json".into()), ("inc", "artists+recordings".into())],
        None,
        None,
    )?;
    let response: Response =
        serde_json::from_value(value).map_err(|_| error("MusicBrainz 返回格式无效。"))?;
    let mut releases = response
        .releases
        .into_iter()
        .map(|release| DiscRelease {
            release_id: release.id,
            title: release.title,
            artist: release
                .artist_credit
                .into_iter()
                .map(|credit| credit.name)
                .filter(|name| !name.is_empty())
                .collect::<Vec<_>>()
                .join(" / "),
            date: release.date,
            country: release.country,
        })
        .collect::<Vec<_>>();
    releases.retain(|release| !release.release_id.is_empty() && !release.title.is_empty());
    releases.truncate(8);
    Ok(releases)
}

#[tauri::command]
pub async fn musicbrainz_disc(
    directory: tauri::State<'_, crate::data_location::DataLocation>,
    disc_id: String,
) -> Result<Vec<DiscRelease>, AppError> {
    validate_id(&disc_id)?;
    let settings = crate::integration_settings::read(&directory.0)?;
    let base = if settings.musicbrainz_base_url.trim().is_empty() {
        DEFAULT_BASE.to_string()
    } else {
        settings.musicbrainz_base_url
    };
    tauri::async_runtime::spawn_blocking(move || lookup(&base, &disc_id))
        .await
        .map_err(|_| error("MusicBrainz 查询未完成。"))?
}
