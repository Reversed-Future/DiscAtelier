use super::*;
use serde::Deserialize;
#[derive(Deserialize)]
struct Images {
    large: String,
}
#[derive(Deserialize)]
struct Subject {
    id: u64,
    #[serde(rename = "type")]
    kind: u32,
    name: String,
    name_cn: String,
    summary: String,
    #[serde(default)]
    date: Option<String>,
    images: Images,
    eps: u32,
    #[serde(default)]
    meta_tags: Vec<String>,
    #[serde(default)]
    infobox: Option<Vec<super::bangumi_facts::InfoEntry>>,
}
#[derive(Deserialize)]
struct Page {
    total: u32,
    data: Vec<Subject>,
}
pub(super) fn auth(request: RequestBuilder) -> Result<RequestBuilder, AppError> {
    Ok(match settings::token("bangumi")? {
        Some(token) => request.bearer_auth(token),
        None => request,
    })
}
fn normalize(s: Subject) -> Result<VideoWork, AppError> {
    if s.kind != 2 && s.kind != 6 {
        return Err(error("该 Bangumi 条目不是动画或影像作品。"));
    }
    let poster = reqwest::Url::parse(&s.images.large)
        .ok()
        .filter(|u| {
            u.scheme() == "https"
                && u.host_str() == Some("lain.bgm.tv")
                && u.username().is_empty()
                && u.password().is_none()
                && u.port().is_none()
        })
        .map(|u| u.to_string())
        .unwrap_or_default();
    Ok(VideoWork {
        source: VideoSource::Bangumi,
        external_id: s.id,
        title: if s.name_cn.trim().is_empty() {
            s.name.clone()
        } else {
            s.name_cn
        },
        original_title: s.name,
        summary: s.summary,
        premiere_date: s.date.unwrap_or_default(),
        poster_url: poster,
        episode_count: Some(s.eps).filter(|n| *n > 0),
        genres: s.meta_tags,
        people: vec![],
        facts: super::bangumi_facts::facts(s.infobox.unwrap_or_default()),
        characters: vec![],
        chapters: None,
        images: None,
    })
}
pub(super) fn search(query: &str, page: u32) -> Result<SearchPage, AppError> {
    let body = serde_json::json!({"keyword":query,"sort":"match","filter":{"type":[2,6]}});
    let value: Page = json(auth(
        client()?
            .post("https://api.bgm.tv/v0/search/subjects")
            .query(&[("limit", 20), ("offset", (page - 1) * 20)])
            .header("Content-Type", "application/json")
            .body(body.to_string()),
    )?)?;
    Ok(SearchPage {
        items: value
            .data
            .into_iter()
            .map(normalize)
            .collect::<Result<_, _>>()?,
        page,
        has_more: page * 20 < value.total,
    })
}
pub(super) fn detail(id: u64) -> Result<VideoWork, AppError> {
    let mut work = normalize(json(auth(
        client()?.get(format!("https://api.bgm.tv/v0/subjects/{id}")),
    )?)?)?;
    work.characters = super::bangumi_characters::fetch(id)?;
    Ok(work)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recorded_yosuga_facts_are_preserved() {
        let work =
            normalize(serde_json::from_str(include_str!("fixtures/bangumi-yosuga.json")).unwrap())
                .unwrap();
        let values = |key: &str| {
            work.facts
                .iter()
                .find(|f| f.label == key)
                .unwrap()
                .values
                .iter()
                .map(|v| v.text.as_str())
                .collect::<Vec<_>>()
        };
        assert_eq!(values("中文名"), ["缘之空"]);
        assert_eq!(
            values("别名"),
            [
                "Yosuga no Sora",
                "In Solitude Where We Are Least Alone",
                "緣之空"
            ]
        );
        assert_eq!(values("话数"), ["12"]);
        assert_eq!(values("放送开始"), ["2010年10月4日"]);
        assert_eq!(values("放送星期"), ["星期一"]);
        assert_eq!(values("原作"), ["Sphere"]);
        assert_eq!(values("播放电视台"), ["AT-X"]);
        assert_eq!(values("播放结束"), ["2010年12月20日"]);
        assert_eq!(values("Copyright"), ["©Sphere／奥木染町内会"]);
        assert_eq!(
            work.facts
                .iter()
                .find(|f| f.label == "官方网站")
                .unwrap()
                .values[0]
                .url,
            "http://king-cr.jp/special/yosuganosora/"
        );
    }
    #[test]
    fn recorded_public_subject_maps_original_title_and_poster() {
        let work =
            normalize(serde_json::from_str(include_str!("fixtures/bangumi-subject.json")).unwrap())
                .unwrap();
        assert_eq!(work.external_id, 311);
        assert_eq!(work.title, "千与千寻");
        assert_eq!(work.original_title, "千と千尋の神隠し");
        assert!(work.poster_url.starts_with("https://lain.bgm.tv/"));
    }
}
