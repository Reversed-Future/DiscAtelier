//! Preserve an old whole-tracklist album choice when its display is split.
use discatelier_contracts::DiscAlbumLink;

pub fn same_disc(left: &str, right: &str, media: &[discatelier_domain::MediumDraft]) -> bool {
    let number = crate::physical_discs::number(left, media);
    number.is_some() && number == crate::physical_discs::number(right, media)
}

pub fn resolve(
    keys: &[String],
    saved: &[DiscAlbumLink],
    media: &[discatelier_domain::MediumDraft],
) -> Vec<DiscAlbumLink> {
    let previous = (!keys.iter().any(|key| key == "unassigned"))
        .then(|| saved.iter().find(|link| link.disc_key == "unassigned"))
        .flatten();
    keys.iter()
        .filter_map(|key| {
            saved
                .iter()
                .find(|link| &link.disc_key == key)
                .or_else(|| {
                    let aliases: Vec<_> = saved
                        .iter()
                        .filter(|link| same_disc(key, &link.disc_key, media))
                        .collect();
                    aliases
                        .first()
                        .copied()
                        .filter(|first| aliases.iter().all(|link| link.album_id == first.album_id))
                })
                .or(previous)
                .map(|link| DiscAlbumLink {
                    disc_key: key.clone(),
                    album_id: link.album_id,
                })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_disc_keeps_the_same_physical_album_without_crossing_media() {
        let media = vec![
            discatelier_domain::MediumDraft {
                carrier_id: "cd".into(),
                label: "CD".into(),
            },
            discatelier_domain::MediumDraft {
                carrier_id: "bd".into(),
                label: "BD".into(),
            },
        ];
        let saved = vec![
            DiscAlbumLink {
                disc_key: "CD".into(),
                album_id: 10,
            },
            DiscAlbumLink {
                disc_key: "BR".into(),
                album_id: 20,
            },
        ];
        let links = resolve(&["manual:1".into(), "section:2".into()], &saved, &media);
        assert_eq!(
            links.iter().map(|link| link.album_id).collect::<Vec<_>>(),
            [10, 20]
        );
        assert!(!same_disc("BD2", "manual:2", &media));
    }
}
