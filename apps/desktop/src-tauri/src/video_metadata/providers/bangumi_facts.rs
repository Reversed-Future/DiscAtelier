use discatelier_contracts::{VideoFact, VideoFactValue};
use serde::Deserialize;

// Exact keys and shapes from Bangumi's WikiV0 schema and subject 7157 response.
#[derive(Deserialize)]
pub(super) struct InfoEntry {
    key: String,
    value: InfoValue,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum InfoValue {
    Text(String),
    List(Vec<InfoItem>),
}
#[derive(Deserialize)]
struct InfoItem {
    #[serde(default)]
    k: String,
    v: String,
}
pub(super) fn facts(entries: Vec<InfoEntry>) -> Vec<VideoFact> {
    const KEYS: &[&str] = &[
        "中文名",
        "别名",
        "话数",
        "放送开始",
        "放送星期",
        "原作",
        "播放电视台",
        "其他电视台",
        "播放结束",
        "Copyright",
        "官方网站",
    ];
    selected_facts(entries, KEYS)
}
pub(super) fn selected_facts(entries: Vec<InfoEntry>, keys: &[&str]) -> Vec<VideoFact> {
    let mut output = Vec::new();
    for key in keys {
        for entry in entries.iter().filter(|entry| entry.key == *key) {
            let texts = match &entry.value {
                InfoValue::Text(text) => vec![text.clone()],
                InfoValue::List(items) => items
                    .iter()
                    .map(|item| {
                        if item.k.is_empty() {
                            item.v.clone()
                        } else {
                            format!("{}：{}", item.k, item.v)
                        }
                    })
                    .collect(),
            };
            let values = texts
                .into_iter()
                .filter(|text| !text.trim().is_empty())
                .map(|text| {
                    let url = if *key == "官方网站" {
                        super::super::links::web_url(&text).unwrap_or_default()
                    } else {
                        String::new()
                    };
                    VideoFactValue { text, url }
                })
                .collect::<Vec<_>>();
            if !values.is_empty() {
                output.push(VideoFact {
                    label: (*key).into(),
                    values,
                });
            }
        }
    }
    output
}
