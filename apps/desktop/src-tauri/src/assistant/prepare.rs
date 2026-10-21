use super::{
    actions::{Action, Images, PreparedAction},
    host::{find, with_library, ToolHost},
};
use discatelier_agent_harness::{tools::*, ActionPreview, ChangeField};
use discatelier_contracts::*;
use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};
use discatelier_integration_http::error;
use std::time::Instant;

fn field(label: &str, before: impl Into<String>, after: impl Into<String>) -> ChangeField {
    ChangeField {
        label: label.into(),
        before: before.into(),
        after: after.into(),
    }
}
fn status(value: &str) -> Result<&'static str, AppError> {
    match value {
        "owned" => Ok("已购入"),
        "wanted" => Ok("想购入"),
        "transit" => Ok("在途"),
        _ => Err(error("收藏状态无效。")),
    }
}
fn tracks(album: &MusicSupplement) -> String {
    album
        .tracks
        .iter()
        .map(|t| {
            format!(
                "{} · {}. {} · {}:{:02}",
                t.disc,
                t.number,
                t.title,
                t.duration_ms / 60000,
                t.duration_ms / 1000 % 60
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
fn date(value: i64) -> String {
    if value == 0 {
        return "未提供".into();
    }
    chrono::DateTime::from_timestamp_millis(value)
        .map(|v| v.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "日期无效".into())
}
fn links(album: &MusicSupplement) -> String {
    album
        .links
        .iter()
        .map(|l| format!("{} · {} → #{}", l.position, l.title, l.song_id))
        .collect::<Vec<_>>()
        .join("\n")
}
fn credits(rows: &[ReleaseCredit]) -> String {
    rows.iter()
        .map(|c| format!("{} · {} {}", c.name, c.role, c.tracks))
        .collect::<Vec<_>>()
        .join("\n")
}
fn release_tracks(rows: &[ReleaseTrack]) -> String {
    rows.iter()
        .map(|t| {
            format!(
                "{} {} {}\n{}{}",
                t.position,
                t.title,
                t.duration,
                credits(&t.extraartists),
                release_tracks(&t.sub_tracks)
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
fn content_fields(content: &EditionContent) -> Vec<ChangeField> {
    vec![
        field(
            "发行曲目与逐曲 Credits",
            "",
            release_tracks(&content.tracks),
        ),
        field(
            "流派／风格",
            "",
            [content.genres.join("、"), content.styles.join("、")].join(" · "),
        ),
        field("Credits", "", credits(&content.credits)),
        field(
            "Companies",
            "",
            content
                .companies
                .iter()
                .map(|c| format!("{} · {} · {}", c.name, c.entity_type_name, c.catno))
                .collect::<Vec<_>>()
                .join("\n"),
        ),
        field("发行说明", "", &content.notes),
    ]
}
fn metadata_fields(old: Option<&MusicSupplement>, album: &MusicSupplement) -> Vec<ChangeField> {
    vec![
        field(
            "网易云专辑",
            old.map(|a| format!("{} · #{}", a.title, a.album_id))
                .unwrap_or_default(),
            format!("{} · #{}", album.title, album.album_id),
        ),
        field(
            "艺术家",
            old.map(|a| a.artists.join("、")).unwrap_or_default(),
            album.artists.join("、"),
        ),
        field(
            "简介",
            old.map(|a| a.description.clone()).unwrap_or_default(),
            album.description.clone(),
        ),
        field(
            "发行公司",
            old.map(|a| a.company.clone()).unwrap_or_default(),
            album.company.clone(),
        ),
        field(
            "数字发行日期",
            old.map(|a| date(a.published_at)).unwrap_or_default(),
            date(album.published_at),
        ),
        field(
            "数字曲目",
            old.map(tracks).unwrap_or_default(),
            tracks(album),
        ),
        field(
            "手动曲目关联",
            old.map(links).unwrap_or_default(),
            links(album),
        ),
    ]
}
fn edition_fields(edition: &EditionDraft, state: &str) -> Result<Vec<ChangeField>, AppError> {
    let carriers = discatelier_domain::carriers();
    Ok(vec![
        field("名称", "", &edition.title),
        field("艺术家／创作者", "", &edition.creator),
        field(
            "分类",
            "",
            if edition.category_id == "music" {
                "音乐"
            } else {
                "影像"
            },
        ),
        field("版本", "", &edition.edition_label),
        field("品番", "", &edition.catalog_number),
        field("条码", "", &edition.barcode),
        field(
            "载体",
            "",
            edition
                .media
                .iter()
                .map(|m| {
                    format!(
                        "{} {}",
                        carriers
                            .iter()
                            .find(|c| c.id == m.carrier_id)
                            .map(|c| c.label.as_str())
                            .unwrap_or(&m.carrier_id),
                        m.label
                    )
                })
                .collect::<Vec<_>>()
                .join("\n"),
        ),
        field("收藏状态", "", status(state)?),
        field(
            "购入信息",
            "",
            "日期、价格、商家、链接、位置和备注留空；币种 CNY",
        ),
    ])
}
pub fn prepare(host: &ToolHost, name: &str, arguments: &str) -> Result<PreparedAction, AppError> {
    match name {
        "propose_add_collection" => add(host, parse(arguments)?),
        "propose_netease_supplement" => supplement(host, parse(arguments)?),
        "propose_cover" => cover(host, parse(arguments)?),
        _ => Err(error("未注册的变更。")),
    }
}
fn wrap(
    kind: &str,
    title: String,
    changes: Vec<ChangeField>,
    images: Images,
    action: Action,
) -> PreparedAction {
    PreparedAction {
        preview: ActionPreview {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            kind: kind.into(),
            changes,
            has_images: images.before.is_some() || images.after.is_some(),
        },
        images,
        action,
        created: Instant::now(),
    }
}
fn add(host: &ToolHost, args: AddCollection) -> Result<PreparedAction, AppError> {
    status(&args.status)?;
    let copy = CopyDraft {
        status: args.status.clone(),
        acquired_at: String::new(),
        amount_minor: None,
        currency: "CNY".into(),
        seller: String::new(),
        purchase_url: String::new(),
        storage_location: String::new(),
        notes: String::new(),
    };
    if args.source == "discogs" {
        let id = args
            .source_id
            .filter(|id| *id > 0)
            .ok_or_else(|| error("需要真实 Discogs 发行 ID。"))?;
        let mut value =
            crate::discogs::assistant::prepare_collection(&host.discogs, id, args.category, copy)?;
        let existing = with_library(&host.library, |s| s.source_copy("discogs", &id.to_string()))?;
        let mut changes = edition_fields(&value.request.edition, &args.status)?;
        if let Some(item) = existing {
            if let Some(content) =
                with_library(&host.library, |s| s.edition_content(&item.edition_id))?
            {
                value.content = content;
            }
            value.request.existing_edition_id = Some(item.edition_id);
            value.request.expected_revision = Some(item.edition_revision);
            // Existing version metadata is kept exactly as shown in the user's collection.
            value.request.edition = item.edition;
            value.request.cover = None;
            changes = edition_fields(&value.request.edition, &args.status)?;
            changes.push(field(
                "已有收藏",
                format!("{} 套", item.edition_copy_count),
                "为此版本再新增一套独立收藏",
            ));
        }
        changes.push(field("来源", "", format!("Discogs #{id}")));
        discatelier_domain::validate_edition(&value.request.edition).map_err(error)?;
        changes.extend(content_fields(&value.content));
        let images = Images {
            before: None,
            after: value.request.cover.clone(),
        };
        return Ok(wrap(
            "add",
            format!("添加收藏 · {}", value.request.edition.title),
            changes,
            images,
            Action::Import(Box::new(value)),
        ));
    }
    let carrier = args
        .carrier_id
        .filter(|id| discatelier_domain::carriers().iter().any(|c| c.id == *id))
        .ok_or_else(|| error("请先询问用户实际载体，不能从数字专辑猜测。"))?;
    let album = match args.source.as_str() {
        "netease" if args.category == "music" => Some(crate::netease::album(
            &host.runtime,
            &host.settings,
            args.source_id
                .filter(|id| *id > 0)
                .ok_or_else(|| error("需要网易云专辑 ID。"))?,
        )?),
        "manual" if args.source_id.is_none() => None,
        _ => return Err(error("新增来源或分类不受支持。")),
    };
    let edition = EditionDraft {
        category_id: args.category,
        title: album
            .as_ref()
            .map(|a| a.title.clone())
            .or(args.title)
            .ok_or_else(|| error("请提供收藏名称。"))?,
        creator: album
            .as_ref()
            .map(|a| a.artists.join("、"))
            .or(args.creator)
            .ok_or_else(|| error("请提供创作者。"))?,
        edition_label: String::new(),
        barcode: String::new(),
        catalog_number: String::new(),
        media: vec![MediumDraft {
            carrier_id: carrier,
            label: String::new(),
        }],
    };
    discatelier_domain::validate_edition(&edition).map_err(error)?;
    let mut changes = edition_fields(&edition, &args.status)?;
    let duplicates = with_library(&host.library, |s| {
        s.list(LibraryQuery {
            category_id: edition.category_id.clone(),
            query: edition.title.clone(),
            status: None,
        })
    })?;
    if !duplicates.copies.is_empty() {
        changes.push(field(
            "同名检索已有收藏",
            duplicates
                .copies
                .iter()
                .map(|c| c.edition.title.clone())
                .collect::<Vec<_>>()
                .join("、"),
            "仍新增一套，不覆盖已有收藏",
        ));
    }
    let cover = if let Some(a) = &album {
        changes.extend(metadata_fields(None, a));
        changes.push(field(
            "资料范围",
            "",
            "网易云数字资料；实体版本、条码、品番未核实",
        ));
        Some(crate::netease_artwork::cover(
            &host.runtime,
            &host.settings,
            a.album_id,
        )?)
    } else {
        None
    };
    let title = format!("添加收藏 · {}", edition.title);
    let request = CreateCopy {
        request_id: uuid::Uuid::new_v4().to_string(),
        edition: Some(edition),
        existing_edition_id: None,
        copy,
        cover: cover.clone(),
        model: None,
        model_token: None,
    };
    Ok(wrap(
        "add",
        title,
        changes,
        Images {
            before: None,
            after: cover,
        },
        Action::Create {
            request: Box::new(request),
            album,
        },
    ))
}
fn supplement(host: &ToolHost, args: SupplementChange) -> Result<PreparedAction, AppError> {
    let (item, old) = with_library(&host.library, |s| {
        let item = find(s, &args.id)?;
        let old = s.supplement(&item.edition_id)?;
        Ok((item, old))
    })?;
    if item.edition.category_id != "music" {
        return Err(error("仅音乐收藏可补充网易云资料。"));
    }
    let mut album = crate::netease::album(&host.runtime, &host.settings, args.album_id)?;
    if let Some(old) = old.as_ref().filter(|o| o.album_id == album.album_id) {
        album.links = old
            .links
            .iter()
            .filter(|l| album.tracks.iter().any(|t| t.id == l.song_id))
            .cloned()
            .collect();
    }
    let mut changes = metadata_fields(old.as_ref(), &album);
    changes.push(field(
        "影响范围",
        "",
        format!(
            "此版本共 {} 套收藏；保留实体资料、Discogs 曲目和封面",
            item.edition_copy_count
        ),
    ));
    Ok(wrap(
        "supplement",
        format!("补充资料 · {}", item.edition.title),
        changes,
        Images::default(),
        Action::Supplement {
            edition: item.edition_id,
            revision: item.edition_revision,
            album,
        },
    ))
}
fn cover(host: &ToolHost, args: CoverChoice) -> Result<PreparedAction, AppError> {
    let (item, before, album) = with_library(&host.library, |s| {
        let item = find(s, &args.id)?;
        let before = item
            .cover_asset_id
            .clone()
            .map(|id| s.cover(id))
            .transpose()?;
        let album = s.supplement(&item.edition_id)?;
        Ok((item, before, album))
    })?;
    let (after, source) = match args.source.as_str() {
        "netease" => {
            let album = album.ok_or_else(|| error("请先关联并保存网易云专辑资料。"))?;
            (
                crate::netease_artwork::cover(&host.runtime, &host.settings, album.album_id)?,
                format!("网易云 · {} · #{}", album.title, album.album_id),
            )
        }
        "discogs" => {
            let source = item
                .source
                .as_ref()
                .filter(|s| s.provider_id == "discogs")
                .ok_or_else(|| error("此收藏没有 Discogs 发行来源。"))?;
            let id = source
                .external_id
                .parse()
                .map_err(|_| error("Discogs 来源 ID 无效。"))?;
            (
                crate::discogs::assistant::original_cover(&host.discogs, id)?,
                format!("Discogs #{id}"),
            )
        }
        _ => return Err(error("封面来源不受支持。")),
    };
    let changes = vec![
        field("封面来源", "当前封面", source),
        field(
            "影响范围",
            "",
            format!("此版本共 {} 套收藏，仅替换封面", item.edition_copy_count),
        ),
    ];
    let action = Action::Cover(UpdateEdition {
        request_id: uuid::Uuid::new_v4().to_string(),
        edition_id: item.edition_id,
        expected_revision: item.edition_revision,
        edition: item.edition.clone(),
        cover: CoverChange::Replace {
            data_url: after.clone(),
        },
        model: ModelChange::Keep,
    });
    Ok(wrap(
        "cover",
        format!("切换封面 · {}", item.edition.title),
        changes,
        Images {
            before,
            after: Some(after),
        },
        action,
    ))
}
