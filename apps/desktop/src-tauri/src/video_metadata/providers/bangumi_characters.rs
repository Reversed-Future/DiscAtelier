use super::{
    bangumi::auth, bangumi_facts, client, error, json, AppError, VideoActorPortrait, VideoCharacter,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Images {
    large: String,
}
#[derive(Deserialize)]
struct Actor {
    name: String,
    images: Option<Images>,
}
#[derive(Deserialize)]
struct Character {
    id: u64,
    name: String,
    relation: String,
    images: Option<Images>,
    #[serde(default)]
    actors: Vec<Actor>,
}
#[derive(Deserialize)]
struct Detail {
    id: u64,
    images: Option<Images>,
    infobox: Option<Vec<bangumi_facts::InfoEntry>>,
}

fn normalize(row: &Character, detail: Detail) -> Result<VideoCharacter, AppError> {
    if row.id != detail.id {
        return Err(error("角色详情编号不一致，未导入。"));
    }
    Ok(VideoCharacter {
        name: row.name.clone(),
        role: row.relation.clone(),
        portrait_url: detail
            .images
            .as_ref()
            .or(row.images.as_ref())
            .map(|i| i.large.clone())
            .unwrap_or_default(),
        avatar: String::new(),
        actors: row.actors.iter().map(|a| a.name.clone()).collect(),
        actor_portraits: row
            .actors
            .iter()
            .filter_map(|a| {
                a.images.as_ref().map(|i| VideoActorPortrait {
                    name: a.name.clone(),
                    portrait_url: i.large.clone(),
                })
            })
            .collect(),
        // Exact infobox keys from the character detail response, not actor attributes.
        facts: bangumi_facts::selected_facts(
            detail.infobox.unwrap_or_default(),
            &["性别", "生日", "血型", "身高"],
        ),
    })
}

pub(super) fn fetch(subject_id: u64) -> Result<Vec<VideoCharacter>, AppError> {
    let http = client()?;
    let rows: Vec<Character> = json(auth(http.get(format!(
        "https://api.bgm.tv/v0/subjects/{subject_id}/characters"
    )))?)?;
    if rows.len() > 500
        || rows
            .iter()
            .any(|r| r.id == 0 || r.id > 9_007_199_254_740_991 || r.actors.len() > 100)
    {
        return Err(error("角色资料超出读取范围，未导入。"));
    }
    let mut output = Vec::with_capacity(rows.len());
    // Reuse the connection pool; at most four detail requests in flight, in source order.
    for batch in rows.chunks(4) {
        let results = std::thread::scope(|scope| {
            let tasks: Vec<_> = batch
                .iter()
                .map(|row| {
                    let http = &http;
                    scope.spawn(move || {
                        let detail = json(auth(
                            http.get(format!("https://api.bgm.tv/v0/characters/{}", row.id)),
                        )?)?;
                        normalize(row, detail)
                    })
                })
                .collect();
            tasks
                .into_iter()
                .map(|t| t.join().map_err(|_| error("角色读取未完成，请重试。"))?)
                .collect::<Result<Vec<_>, AppError>>()
        })?;
        output.extend(results);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_character_details_keep_portrait_facts_and_voice_actor() {
        let rows: Vec<Character> =
            serde_json::from_str(include_str!("fixtures/bangumi-characters.json")).unwrap();
        let detail =
            serde_json::from_str(include_str!("fixtures/bangumi-character-detail.json")).unwrap();
        let role = normalize(&rows[0], detail).unwrap();
        assert_eq!(role.name, "春日野穹");
        assert_eq!(role.role, "主角");
        assert_eq!(role.actors, ["田口宏子"]);
        assert!(role.portrait_url.contains("/pic/crt/l/"));
        assert_eq!(role.actor_portraits[0].name, "田口宏子");
        assert!(role.actor_portraits[0].portrait_url.contains("5020_prsn_"));
        let facts: Vec<_> = role
            .facts
            .iter()
            .map(|f| (f.label.as_str(), f.values[0].text.as_str()))
            .collect();
        assert_eq!(
            facts,
            [
                ("性别", "女"),
                ("生日", "2月5日"),
                ("血型", "O"),
                ("身高", "152cm")
            ]
        );
    }
    #[test]
    fn all_recorded_yosuga_characters_map_in_source_order() {
        let rows: Vec<Character> =
            serde_json::from_str(include_str!("fixtures/bangumi-characters.json")).unwrap();
        let details: Vec<Detail> =
            serde_json::from_str(include_str!("fixtures/bangumi-character-details.json")).unwrap();
        assert_eq!(rows.len(), 26);
        assert_eq!(details.len(), rows.len());
        for (row, detail) in rows.iter().zip(details) {
            let character = normalize(row, detail).unwrap();
            assert_eq!(character.name, row.name);
            assert!(character
                .facts
                .iter()
                .all(|f| ["性别", "生日", "血型", "身高"].contains(&f.label.as_str())));
        }
    }
    #[test]
    fn missing_attributes_are_not_invented_and_wrong_id_is_rejected() {
        let rows: Vec<Character> =
            serde_json::from_str(include_str!("fixtures/bangumi-characters.json")).unwrap();
        let role = normalize(
            &rows[0],
            Detail {
                id: rows[0].id,
                images: None,
                infobox: None,
            },
        )
        .unwrap();
        assert!(role.facts.is_empty());
        assert!(!role.portrait_url.is_empty());
        assert!(normalize(
            &rows[0],
            Detail {
                id: rows[0].id + 1,
                images: None,
                infobox: None
            }
        )
        .is_err());
    }
}
