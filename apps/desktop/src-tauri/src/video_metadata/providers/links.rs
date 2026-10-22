use super::*;
pub fn parse_link(value: &str) -> Result<Option<(VideoSource, u64)>, AppError> {
    if !value.contains("://") {
        return Ok(None);
    }
    let url =
        reqwest::Url::parse(value).map_err(|_| error("链接格式无效，请粘贴作品页面链接。"))?;
    if !["https", "http"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(error("不支持此作品链接。"));
    }
    let segments: Vec<_> = url
        .path_segments()
        .ok_or_else(|| error("作品链接无效。"))?
        .filter(|s| !s.is_empty())
        .collect();
    if segments.len() != 2 {
        return Err(error("请使用作品主页链接，不要使用人物或单集链接。"));
    }
    let source = match (url.host_str(), segments[0]) {
        (Some("www.themoviedb.org" | "themoviedb.org"), "movie") => VideoSource::TmdbMovie,
        (Some("www.themoviedb.org" | "themoviedb.org"), "tv") => VideoSource::TmdbTv,
        (Some("bgm.tv" | "bangumi.tv" | "chii.in"), "subject") => VideoSource::Bangumi,
        _ => return Err(error("仅支持 TMDB 电影／剧集和 Bangumi 条目链接。")),
    };
    // TMDB officially uses both numeric and ID-title slugs; Bangumi uses numeric IDs.
    let id = if source == VideoSource::Bangumi {
        segments[1]
    } else {
        segments[1].split('-').next().unwrap_or("")
    };
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(error("作品链接缺少有效编号。"));
    }
    let id = id
        .parse::<u64>()
        .ok()
        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
        .ok_or_else(|| error("作品编号无效。"))?;
    Ok(Some((source, id)))
}
