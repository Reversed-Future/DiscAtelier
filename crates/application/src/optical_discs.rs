//! Disc identities and display titles follow metadata/discTracks.ts.
use discatelier_contracts::{OpticalDisc, ReleaseTrack};

pub fn groups(tracks: &[ReleaseTrack], title: &str) -> Vec<OpticalDisc> {
    fn visit<'a>(
        rows: &'a [ReleaseTrack],
        parent: Option<&str>,
        output: &mut Vec<(&'a ReleaseTrack, Option<String>, bool)>,
    ) {
        for track in rows {
            let key =
                crate::disc_albums::disc_key(&track.position).or_else(|| parent.map(str::to_owned));
            let heading = track.type_ == "heading" || !track.sub_tracks.is_empty();
            output.push((track, key.clone(), heading));
            visit(&track.sub_tracks, key.as_deref(), output);
        }
    }
    let mut rows = Vec::new();
    visit(tracks, None, &mut rows);
    let mut result: Vec<OpticalDisc> = Vec::new();
    let mut heading = None;
    for (track, key, is_heading) in rows {
        if is_heading {
            if heading.is_none() && track.title != "-" {
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
    fn headings_and_explicit_positions_keep_ui_order() {
        let rows: Vec<ReleaseTrack> = serde_json::from_value(serde_json::json!([
            {"title":"CD", "type_":"heading"}, {"title":"Lemon", "position":"CD-1"},
            {"title":"Live", "type_":"heading"}, {"title":"Opening", "position":"DVD-1"}
        ]))
        .unwrap();
        let discs = groups(&rows, "Lemon");
        assert_eq!(discs[1].key, "DVD");
        assert_eq!(discs[1].label, "Disc 2. Live");
    }
}
