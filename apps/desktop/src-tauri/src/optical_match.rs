use discatelier_contracts::{LibraryCopy, OpticalCandidate};

fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn score(label: &str, copy: &LibraryCopy) -> (u32, &'static str) {
    let label = normalize(label);
    if label.is_empty() {
        return (0, "none");
    }
    let edition = &copy.edition;
    // Generic format labels such as "DVD" are not disc titles and must not
    // turn every DVD in the library into a match. Creator matches are useful
    // for browsing, but are weaker than a title/catalog match.
    let values = [
        (edition.title.as_str(), "title", 100, 80, 70),
        (edition.edition_label.as_str(), "edition", 100, 80, 70),
        (edition.catalog_number.as_str(), "catalog", 100, 80, 70),
        (edition.barcode.as_str(), "barcode", 100, 80, 70),
        (edition.creator.as_str(), "creator", 55, 45, 40),
    ];
    let mut result = (0, "none");
    for (value, kind, exact, prefix, contains) in values {
        let value = normalize(value);
        if value.is_empty() {
            continue;
        }
        let score = if value == label {
            exact
        } else if value.len() >= 4
            && label.len() >= 4
            && (value.starts_with(&label) || label.starts_with(&value))
        {
            prefix
        } else if value.len() >= 4
            && label.len() >= 4
            && (value.contains(&label) || label.contains(&value))
        {
            contains
        } else {
            0
        };
        if score > result.0 {
            result = (score, kind);
        }
    }
    result
}

pub fn candidates(copies: Vec<LibraryCopy>, label: &str) -> Vec<OpticalCandidate> {
    let mut values = copies
        .into_iter()
        .map(|copy| {
            let (score, match_kind) = score(label, &copy);
            OpticalCandidate {
                copy_id: copy.id,
                edition_id: copy.edition_id,
                title: copy.edition.title,
                creator: copy.edition.creator,
                edition_label: copy.edition.edition_label,
                category_id: copy.edition.category_id,
                score,
                match_kind: match_kind.into(),
            }
        })
        .collect::<Vec<_>>();
    values.sort_by_key(|candidate| std::cmp::Reverse(candidate.score));
    values.truncate(8);
    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use discatelier_contracts::LibraryCopy;
    use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};

    fn copy(title: &str, label: &str) -> LibraryCopy {
        LibraryCopy {
            id: "copy".into(),
            edition_id: "edition".into(),
            edition_revision: 1,
            edition_copy_count: 1,
            cover_asset_id: None,
            model_asset_id: None,
            model_title: None,
            revision: 1,
            added_at: "2026-10-23T00:00:00Z".into(),
            edition: EditionDraft {
                category_id: "video".into(),
                title: title.into(),
                creator: "creator".into(),
                edition_label: label.into(),
                barcode: "".into(),
                catalog_number: "".into(),
                media: vec![MediumDraft {
                    carrier_id: "bd".into(),
                    label: label.into(),
                }],
            },
            copy: CopyDraft {
                status: "owned".into(),
                acquired_at: "".into(),
                amount_minor: None,
                currency: "CNY".into(),
                seller: "".into(),
                purchase_url: "".into(),
                storage_location: "".into(),
                notes: "".into(),
            },
            source: None,
        }
    }

    #[test]
    fn exact_and_partial_labels_are_ranked_without_guessing_titles() {
        let rows = candidates(
            vec![
                copy("缘之空", "Yosuga no Sora"),
                copy("其他作品", "Other Disc"),
            ],
            "YOSUGA_NO_SORA",
        );
        assert_eq!(rows[0].title, "缘之空");
        assert_eq!(rows[0].score, 100);
        assert!(candidates(vec![copy("其他作品", "Other Disc")], "unknown")
            .iter()
            .all(|row| row.score == 0));
    }

    #[test]
    fn normalization_ignores_case_spaces_and_punctuation() {
        assert_eq!(normalize(" Yosuga no Sora "), "yosuganosora");
    }

    #[test]
    fn generic_dvd_media_label_does_not_match_a_volume_label() {
        let mut dvd = copy(
            "2+0+2+1+3+1+1= 10 Years 10 Songs",
            "Japan · 2021 · CD + DVD",
        );
        dvd.edition.media[0].label = "DVD".into();
        let rows = candidates(vec![dvd], "DVD_VIDEO");
        assert_eq!(rows[0].score, 0);
        assert_eq!(rows[0].match_kind, "none");
    }

    #[test]
    fn creator_only_match_is_deliberately_weak() {
        let mut lemon = copy("Other", "Other");
        lemon.edition.creator = "Lemon".into();
        let rows = candidates(vec![lemon], "LEMON");
        assert_eq!(rows[0].score, 55);
        assert_eq!(rows[0].match_kind, "creator");
    }
}
