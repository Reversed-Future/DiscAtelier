//! Match menu evidence to saved Disc titles, never infer a Disc from its artist.
use discatelier_contracts::{AppError, LibraryCopy, LibraryQuery};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscMatch {
    pub copy_id: String,
    pub title: String,
    pub disc_key: String,
    pub disc_label: String,
    pub score: u32,
    pub reason: String,
}

fn compact(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .filter(|ch| ch.is_alphanumeric())
        .collect()
}

// Compare actual printed year/month/day, including "2018 Live / ... 1月10日".
// This transforms display text only, never database keys or provider fields.
fn dates(text: &str) -> BTreeSet<(u32, u32, u32)> {
    let numbers: Vec<u32> = text
        .split(|ch: char| !ch.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect();
    numbers
        .windows(3)
        .filter_map(|parts| {
            chrono::NaiveDate::from_ymd_opt(parts[0] as i32, parts[1], parts[2])
                .filter(|_| (1900..=2199).contains(&parts[0]))
                .map(|_| (parts[0], parts[1], parts[2]))
        })
        .collect()
}

fn score(evidence: &str, title: &str, creator: &str) -> (u32, &'static str) {
    let left_dates = dates(evidence);
    let right_dates = dates(title);
    if !left_dates.is_empty() && !right_dates.is_empty() && left_dates.is_disjoint(&right_dates) {
        return (0, "演出日期不一致");
    }
    let left = compact(evidence);
    let right = compact(title);
    let artist = compact(creator);
    if right.chars().count() >= 6 && right != artist && left.contains(&right) {
        return (100, "菜单文字与 Disc 标题一致");
    }
    let chars: Vec<char> = right.chars().collect();
    let shared: BTreeSet<String> = chars
        .windows(3)
        .map(|part| part.iter().collect::<String>())
        .filter(|part| {
            !part.chars().any(|ch| ch.is_ascii_digit())
                && !artist.contains(part)
                && left.contains(part)
        })
        .collect();
    if !left_dates.is_disjoint(&right_dates) && shared.len() >= 2 {
        return (95, "演出年月日一致，场馆或演出标题文字相符");
    }
    (0, "尚无足够的 Disc 内容依据")
}

pub fn matches(
    service: &discatelier_application::LibraryService<discatelier_storage::SqliteLibrary>,
    evidence: &str,
) -> Result<Vec<DiscMatch>, AppError> {
    let mut result = Vec::new();
    for category in ["music", "video"] {
        for copy in service
            .list(LibraryQuery {
                category_id: category.into(),
                status: Some("owned".into()),
                query: String::new(),
            })?
            .copies
        {
            let content = service
                .edition_content(&copy.edition_id)?
                .unwrap_or_default();
            result.extend(match_copy(&copy, &content.tracks, evidence));
        }
    }
    result.sort_by_key(|row| std::cmp::Reverse(row.score));
    Ok(result)
}

fn match_copy(
    copy: &LibraryCopy,
    tracks: &[discatelier_contracts::ReleaseTrack],
    evidence: &str,
) -> Vec<DiscMatch> {
    discatelier_application::optical_discs::for_media(
        tracks,
        &copy.edition.title,
        &copy.edition.media,
    )
    .into_iter()
    .filter_map(|disc| {
        let (score, reason) = score(evidence, &disc.title, &copy.edition.creator);
        (score > 0).then(|| DiscMatch {
            copy_id: copy.id.clone(),
            title: copy.edition.title.clone(),
            disc_key: disc.key,
            disc_label: disc.label,
            score,
            reason: reason.into(),
        })
    })
    .collect()
}

pub fn automatic(rows: &[DiscMatch], confidence: u8) -> Option<&DiscMatch> {
    let first = rows.first()?;
    (confidence >= 80
        && first.score >= 90
        && rows
            .get(1)
            .is_none_or(|next| first.score >= next.score + 10))
    .then_some(first)
}

#[cfg(test)]
mod tests {
    use super::*;
    const TITLE: &str = "米津玄師 2018 Live / Fogbound 1月10日 日本武道館";
    #[test]
    fn menu_resolves_the_saved_second_disc_instead_of_an_artist_only_album() {
        let copy: LibraryCopy = serde_json::from_value(serde_json::json!({
            "id":"copy-lemon", "editionId":"edition-lemon", "editionRevision":1,
            "editionCopyCount":1, "coverAssetId":null, "modelAssetId":null, "modelTitle":null,
            "revision":1, "addedAt":"2026-10-26", "source":null,
            "edition":{"categoryId":"music", "title":"Lemon", "creator":"米津玄師",
                "editionLabel":"CD + DVD", "barcode":"", "catalogNumber":"",
                "media":[{"carrierId":"cd","label":"CD"},{"carrierId":"dvd","label":"DVD"}]},
            "copy":{"status":"owned","acquiredAt":"","amountMinor":null,"currency":"CNY",
                "seller":"","purchaseUrl":"","storageLocation":"","notes":""}
        }))
        .unwrap();
        let tracks =
            serde_json::from_value::<Vec<discatelier_contracts::ReleaseTrack>>(serde_json::json!([
                {"title":"CD","type_":"heading"}, {"title":"Lemon","position":"CD-1"},
                {"title":TITLE,"type_":"heading"}, {"title":"Opening","position":"DVD-1"}
            ]))
            .unwrap();
        let result = match_copy(
            &copy,
            &tracks,
            "米津玄師（KENSHI YONEZU） · 2018.01.10 日本武道館",
        );
        let linked = automatic(&result, 95).unwrap();
        assert_eq!(linked.copy_id, "copy-lemon");
        assert_eq!(linked.disc_key, "DVD");
        assert_eq!(linked.disc_label, format!("Disc 2. {TITLE}"));
        assert!(match_copy(&copy, &tracks, "米津玄師（KENSHI YONEZU）").is_empty());
    }
    #[test]
    fn recognizes_concert_date_and_venue_without_requiring_album_title() {
        assert_eq!(
            score(
                "米津玄師（KENSHI YONEZU） · 2018.01.10 日本武道館",
                TITLE,
                "米津玄師"
            )
            .0,
            95
        );
        assert_eq!(score("米津玄師 KENSHI YONEZU", TITLE, "米津玄師").0, 0);
        assert_eq!(
            score("米津玄師 2018.01.09 日本武道館", TITLE, "米津玄師").0,
            0
        );
    }
    #[test]
    fn artist_only_and_ambiguous_results_are_not_automatic() {
        assert_eq!(
            score("KENSHI YONEZU", "KENSHI YONEZU", "KENSHI YONEZU").0,
            0
        );
        let row = DiscMatch {
            copy_id: "copy".into(),
            title: "Lemon".into(),
            disc_key: "DVD".into(),
            disc_label: TITLE.into(),
            score: 95,
            reason: String::new(),
        };
        assert!(automatic(std::slice::from_ref(&row), 95).is_some());
        assert!(automatic(std::slice::from_ref(&row), 40).is_none());
        assert!(automatic(&[row.clone(), row], 95).is_none());
    }
}
