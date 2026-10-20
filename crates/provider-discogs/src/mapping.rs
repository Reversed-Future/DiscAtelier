use discatelier_contracts::*;
use discatelier_domain::{EditionDraft, MediumDraft};

/// Exact names from Discogs Format guidelines; unknown names require an explicit choice.
pub fn import_draft(
    release: &MetadataRelease,
    category_id: String,
) -> Result<(EditionDraft, Vec<ImportedIdentifier>), AppError> {
    let mut media = Vec::new();
    for format in &release.formats {
        if ["Box Set", "All Media"].contains(&format.name.as_str()) {
            continue;
        }
        let qty = format
            .qty
            .parse::<usize>()
            .ok()
            .filter(|qty| (1..=99).contains(qty))
            .ok_or_else(|| {
                AppError::new(
                    "provider_schema",
                    "这个发行的载体数量无法识别，请核对 Discogs 资料。",
                )
            })?;
        if media.len() + qty > 99 {
            return Err(AppError::new("validation", "当前每套最多支持 99 张载体。"));
        }
        let carrier = match format.name.as_str() {
            "CD" | "CDr" => "cd",
            "DVD" => "dvd",
            "Blu-ray" => "bd",
            "Vinyl" => "vinyl",
            "Cassette" => "cassette",
            _ => "",
        };
        let label = [
            format.name.clone(),
            format.descriptions.join(" / "),
            format.text.clone(),
        ]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
        for _ in 0..qty {
            media.push(MediumDraft {
                carrier_id: carrier.into(),
                label: label.clone(),
            });
        }
    }
    if media.is_empty() {
        return Err(AppError::new(
            "provider_schema",
            "这个发行没有可确认的载体。",
        ));
    }
    let identifiers = release
        .identifiers
        .iter()
        .map(|item| ImportedIdentifier {
            namespace: "identifier".into(),
            kind: item.kind.clone(),
            value: item.value.clone(),
            description: item.description.clone(),
        })
        .chain(release.labels.iter().map(|label| ImportedIdentifier {
            namespace: "catalog".into(),
            kind: label.name.clone(),
            value: label.catno.clone(),
            description: String::new(),
        }))
        .collect();
    let edition = EditionDraft {
        category_id,
        title: release.title.clone(),
        creator: release
            .artists
            .iter()
            .map(|artist| {
                let name = if artist.anv.is_empty() {
                    &artist.name
                } else {
                    &artist.anv
                };
                if artist.join.is_empty() {
                    name.clone()
                } else {
                    format!("{name} {}", artist.join)
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
        edition_label: [
            release.country.clone(),
            release.released.clone(),
            release
                .formats
                .iter()
                .map(|format| {
                    [
                        format.name.clone(),
                        format.descriptions.join(" / "),
                        format.text.clone(),
                    ]
                    .into_iter()
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>()
                    .join(" · ")
                })
                .collect::<Vec<_>>()
                .join(" + "),
        ]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · "),
        barcode: release
            .identifiers
            .iter()
            .find(|item| item.kind == "Barcode")
            .map(|item| item.value.clone())
            .unwrap_or_default(),
        catalog_number: release
            .labels
            .first()
            .map(|item| item.catno.clone())
            .unwrap_or_default(),
        media,
    };
    Ok((edition, identifiers))
}
