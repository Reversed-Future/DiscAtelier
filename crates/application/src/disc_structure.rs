//! Resolve source sections against physical media before using position syntax.
use crate::disc_albums::disc_key;
use discatelier_contracts::ReleaseTrack;
use std::collections::BTreeSet;

pub type TrackRow<'a> = (&'a ReleaseTrack, Option<String>, bool, bool);

fn playable(rows: &[&ReleaseTrack]) -> bool {
    rows.iter().any(|row| {
        if row.sub_tracks.is_empty() {
            row.type_ != "heading"
        } else {
            playable(&row.sub_tracks.iter().collect::<Vec<_>>())
        }
    })
}
fn sections(tracks: &[ReleaseTrack]) -> Vec<Vec<&ReleaseTrack>> {
    let mut sections = Vec::new();
    let mut current = Vec::new();
    for row in tracks {
        if ((row.type_ == "heading" && row.heading_kind.as_deref() != Some("section"))
            || !row.sub_tracks.is_empty())
            && playable(&current)
        {
            sections.push(std::mem::take(&mut current));
        }
        current.push(row);
        if !row.sub_tracks.is_empty() {
            sections.push(std::mem::take(&mut current));
        }
    }
    if playable(&current) {
        sections.push(current);
    } else if let Some(last) = sections.last_mut() {
        last.extend(current);
    }
    sections
}
fn explicit(rows: &[&ReleaseTrack], keys: &mut BTreeSet<String>) -> bool {
    rows.iter().all(|row| {
        if row.disc_number.is_none() {
            if let Some(key) = disc_key(&row.position) {
                keys.insert(key);
            }
        }
        explicit(&row.sub_tracks.iter().collect::<Vec<_>>(), keys)
    })
}
fn section_keys(sections: &[Vec<&ReleaseTrack>], count: usize) -> Option<Vec<String>> {
    if count < 2 || sections.len() != count {
        return None;
    }
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for (index, section) in sections.iter().enumerate() {
        let mut keys = BTreeSet::new();
        if !explicit(section, &mut keys) || keys.len() > 1 {
            return None;
        }
        if let Some(key) = keys.into_iter().next() {
            if !seen.insert(key.clone()) {
                return None;
            }
            result.push(key);
        } else {
            result.push(format!("section:{}", index + 1));
        }
    }
    Some(result)
}
fn flatten<'a>(
    row: &'a ReleaseTrack,
    parent: Option<&str>,
    section: Option<&str>,
    output: &mut Vec<TrackRow<'a>>,
) {
    let key = row
        .disc_number
        .map(|disc| format!("manual:{disc}"))
        .or_else(|| {
            parent
                .filter(|key| key.starts_with("manual:"))
                .map(str::to_owned)
        })
        .or_else(|| section.map(str::to_owned))
        .or_else(|| disc_key(&row.position))
        .or_else(|| parent.map(str::to_owned));
    output.push((
        row,
        key.clone(),
        row.type_ == "heading" || !row.sub_tracks.is_empty(),
        section.is_some(),
    ));
    for child in &row.sub_tracks {
        flatten(child, key.as_deref(), section, output);
    }
}
pub fn rows(tracks: &[ReleaseTrack], disc_count: usize) -> Vec<TrackRow<'_>> {
    let sections = sections(tracks);
    let keys = section_keys(&sections, disc_count);
    let mut result = Vec::new();
    if let Some(keys) = keys {
        for (section, key) in sections.iter().zip(keys) {
            for row in section {
                flatten(row, None, Some(&key), &mut result);
            }
        }
    } else {
        for row in tracks {
            flatten(row, None, None, &mut result);
        }
    }
    result
}
