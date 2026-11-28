use crate::db_error;
use discatelier_application::{optical_discs::for_edition, physical_discs::number};
use discatelier_contracts::{AppError, EditionContent};
use discatelier_domain::{EditionDraft, MediumDraft};
use rusqlite::{params, Connection};

pub(crate) struct BoundDiscs {
    old_media: Vec<MediumDraft>,
    bindings: Vec<(String, String)>,
}

pub(crate) fn load(db: &Connection, edition: &str) -> Result<Option<BoundDiscs>, AppError> {
    let mut statement = db.prepare("SELECT media_token,disc_key FROM optical_bindings WHERE disc_key IS NOT NULL AND copy_id IN (SELECT id FROM copies WHERE edition_id=?1)").map_err(db_error)?;
    let bindings: Vec<(String, String)> = statement
        .query_map([edition], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    if bindings.is_empty() {
        return Ok(None);
    }
    let mut media = db
        .prepare("SELECT carrier_id,label FROM media WHERE edition_id=?1 ORDER BY position")
        .map_err(db_error)?;
    let old_media = media
        .query_map([edition], |r| {
            Ok(MediumDraft {
                carrier_id: r.get(0)?,
                label: r.get(1)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    Ok(Some(BoundDiscs {
        old_media,
        bindings,
    }))
}

impl BoundDiscs {
    pub(crate) fn sync(
        self,
        db: &Connection,
        edition: &EditionDraft,
        content: &EditionContent,
    ) -> Result<(), AppError> {
        let discs = for_edition(&content.tracks, edition);
        for (token, key) in &self.bindings {
            let disc = if let Some(old) = number(key, &self.old_media) {
                let slot = self.new_slot(old, &edition.media);
                discs
                    .iter()
                    .find(|d| slot.is_some() && number(&d.key, &edition.media) == slot)
            } else {
                discs
                    .iter()
                    .find(|d| &d.key == key && number(&d.key, &edition.media).is_none())
            };
            db.execute(
                "UPDATE optical_bindings SET disc_key=?1,disc_label=?2 WHERE media_token=?3",
                params![disc.map(|d| &d.key), disc.map(|d| &d.label), token],
            )
            .map_err(db_error)?;
        }
        Ok(())
    }

    fn new_slot(&self, old: usize, media: &[MediumDraft]) -> Option<usize> {
        let original = &self.old_media[old - 1];
        let same =
            |m: &MediumDraft| m.carrier_id == original.carrier_id && m.label == original.label;
        if self.old_media.iter().filter(|m| same(m)).count() == 1 {
            let mut slots = media.iter().enumerate().filter(|(_, m)| same(m));
            if let (Some((index, _)), None) = (slots.next(), slots.next()) {
                return Some(index + 1);
            }
        }
        // Renaming or changing the carrier preserves its slot. After a removal,
        // a disc without a unique surviving identity stays bound only to its copy.
        (media.len() >= self.old_media.len()).then_some(old)
    }
}
