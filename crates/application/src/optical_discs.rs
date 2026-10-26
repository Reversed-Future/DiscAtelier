//! Disc identities and display titles follow metadata/discTracks.ts.
use discatelier_contracts::{OpticalDisc, ReleaseTrack};

pub fn physical_count(media: &[discatelier_domain::MediumDraft]) -> usize {
    if media
        .iter()
        .all(|row| ["cd", "dvd", "bd"].contains(&row.carrier_id.as_str()))
    {
        media.len()
    } else {
        0
    }
}

pub fn for_media(
    tracks: &[ReleaseTrack],
    title: &str,
    media: &[discatelier_domain::MediumDraft],
) -> Vec<OpticalDisc> {
    let mut result: Vec<(Option<usize>, OpticalDisc)> = Vec::new();
    for mut disc in groups(tracks, title, physical_count(media)) {
        let number = crate::physical_discs::number(&disc.key, media);
        disc.label = number
            .map(|value| format!("Disc {value}. {}", disc.title))
            .unwrap_or_else(|| disc.title.clone());
        if let Some((_, existing)) = result
            .iter_mut()
            .find(|(slot, _)| number.is_some() && *slot == number)
        {
            if existing.key.starts_with("manual:") && !disc.key.starts_with("manual:") {
                existing.key = disc.key;
            }
            if existing.title == title && disc.title != title {
                existing.title = disc.title;
            }
            existing.label = format!("Disc {}. {}", number.unwrap(), existing.title);
        } else {
            result.push((number, disc));
        }
    }
    result.sort_by_key(|(number, _)| number.unwrap_or(usize::MAX));
    result.into_iter().map(|(_, disc)| disc).collect()
}

pub fn groups(tracks: &[ReleaseTrack], title: &str, disc_count: usize) -> Vec<OpticalDisc> {
    let rows = crate::disc_structure::rows(tracks, disc_count);
    let mut result: Vec<OpticalDisc> = Vec::new();
    let mut heading = None;
    for (track, key, is_heading, structured) in rows {
        if is_heading
            && key
                .as_deref()
                .is_some_and(|key| structured || key.starts_with("manual:"))
        {
            let id = key.clone().unwrap();
            let name = if track.heading_kind.as_deref() == Some("section")
                || track.title.is_empty()
                || track.title == "-"
            {
                title
            } else {
                &track.title
            };
            if !result.iter().any(|disc| disc.key == id) {
                result.push(OpticalDisc {
                    key: id,
                    label: format!("Disc {}. {name}", result.len() + 1),
                    title: name.into(),
                });
            } else if let Some(disc) = result
                .iter_mut()
                .find(|disc| disc.key == id && disc.title == title && name != title)
            {
                disc.title = name.into();
            }
            continue;
        }
        if is_heading {
            if heading.is_none()
                && track.title != "-"
                && track.heading_kind.as_deref() != Some("section")
            {
                heading = Some(track.title.as_str());
            }
            continue;
        }
        let id = key.as_deref().unwrap_or("unassigned");
        if !result.iter().any(|disc| disc.key == id) {
            let name = heading
                .filter(|value| !value.is_empty())
                .unwrap_or(title)
                .to_string();
            let label = if key.is_some() {
                format!("Disc {}. {}", result.len() + 1, name)
            } else {
                name.clone()
            };
            result.push(OpticalDisc {
                key: id.into(),
                label,
                title: name,
            });
        }
        heading = None;
    }
    if result.is_empty() && heading.is_some() {
        result.push(OpticalDisc {
            key: "unassigned".into(),
            label: title.into(),
            title: title.into(),
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_source_structure_fixtures_match_frontend_group_keys() {
        let fixtures: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/disc-structure.json"))
                .unwrap();
        for fixture in fixtures.as_array().unwrap() {
            let rows: Vec<ReleaseTrack> =
                serde_json::from_value(fixture["tracks"].clone()).unwrap();
            let before = serde_json::to_value(&rows).unwrap();
            let discs = if fixture.get("media").is_some() {
                let media = serde_json::from_value::<Vec<discatelier_domain::MediumDraft>>(
                    fixture["media"].clone(),
                )
                .unwrap();
                for_media(&rows, "Fixture", &media)
            } else {
                groups(
                    &rows,
                    "Fixture",
                    fixture["discCount"].as_u64().unwrap() as usize,
                )
            };
            if let Some(numbers) = fixture.get("numbers") {
                for (disc, number) in discs.iter().zip(numbers.as_array().unwrap()) {
                    assert!(disc
                        .label
                        .starts_with(&format!("Disc {}.", number.as_u64().unwrap())));
                }
            }
            let keys: Vec<_> = discs.into_iter().map(|disc| disc.key).collect();
            assert_eq!(
                serde_json::to_value(keys).unwrap(),
                fixture["keys"],
                "{}",
                fixture["name"]
            );
            assert_eq!(serde_json::to_value(rows).unwrap(), before);
        }
    }
    #[test]
    fn stored_compact_positions_expose_the_same_two_discs_as_the_ui() {
        let rows: Vec<ReleaseTrack> = serde_json::from_value(serde_json::json!([
            {"title":"Family Song", "position":"CD12"},
            {"title":"Hello Song", "position":"CD14"},
            {"title":"星野源 Live At Onkio Haus Studio", "type_":"heading"},
            {"title":"Night Troop", "position":"BR1"},
            {"title":"肌", "position":"BR2"}
        ]))
        .unwrap();
        let before = serde_json::to_value(&rows).unwrap();
        let discs = groups(&rows, "Pop Virus", 2);
        assert_eq!(discs.len(), 2);
        assert_eq!(discs[0].key, "CD");
        assert_eq!(discs[1].key, "BR");
        assert_eq!(discs[1].label, "Disc 2. 星野源 Live At Onkio Haus Studio");
        assert_eq!(serde_json::to_value(&rows).unwrap(), before);
    }
    #[test]
    fn headings_and_explicit_positions_keep_ui_order() {
        let rows: Vec<ReleaseTrack> = serde_json::from_value(serde_json::json!([
            {"title":"CD", "type_":"heading"}, {"title":"Lemon", "position":"CD-1"},
            {"title":"Live", "type_":"heading"}, {"title":"Opening", "position":"DVD-1"}
        ]))
        .unwrap();
        let discs = groups(&rows, "Lemon", 2);
        assert_eq!(discs[1].key, "DVD");
        assert_eq!(discs[1].label, "Disc 2. Live");
    }
}
