use discatelier_contracts::AppError;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchLibrary {
    pub category: String,
    pub query: String,
    pub status: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CopyId {
    pub id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Query {
    pub query: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoteId {
    pub id: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangeStatus {
    pub id: String,
    pub status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddCollection {
    pub source: String,
    pub source_id: Option<u64>,
    pub category: String,
    pub status: String,
    pub carrier_id: Option<String>,
    pub title: Option<String>,
    pub creator: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupplementChange {
    pub id: String,
    pub album_id: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CoverChoice {
    pub id: String,
    pub source: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayMusic {
    pub id: String,
    pub song_id: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlayerControl {
    pub action: String,
    pub seconds: Option<f64>,
}

pub fn definitions() -> Value {
    let tool = |name: &str, description: &str, properties: Value, required: Value| json!({"type":"function","function":{"name":name,"description":description,"parameters":{"type":"object","properties":properties,"required":required,"additionalProperties":false}}});
    json!([
        tool("propose_add_collection", "提出新增一套收藏，先查重并核对实体载体和状态；source 为 discogs、netease 或 manual。Discogs 使用真实发行载体；其他来源须用户提供 carrierId。manual 须提供 title、creator，其余不适用字段传 null。界面确认才写入。",
            json!({"source":{"type":"string","enum":["discogs","netease","manual"]},"sourceId":{"type":["integer","null"]},"category":{"type":"string","enum":["music","video"]},"status":{"type":"string","enum":["owned","wanted","transit"]},"carrierId":{"type":["string","null"],"enum":["cd","dvd","bd","vinyl","cassette","other",null]},"title":{"type":["string","null"]},"creator":{"type":["string","null"]}}),
            json!(["source","sourceId","category","status","carrierId","title","creator"])),
        tool("propose_netease_supplement", "为指定收藏版本提出一张网易云专辑的资料补全：新 albumId 追加，已有 ID 更新该张；保留其他专辑、实体信息、Disc 绑定和独立单曲关联。不能修改分盘绑定。展示具体变化，界面确认后由应用保存。", json!({"id":{"type":"string"},"albumId":{"type":"integer"}}), json!(["id","albumId"])),
        tool("propose_cover", "提出更换收藏版本封面。source=netease 使用默认关联专辑，不能指定其他 albumId；discogs 使用收藏原发行。以预览的实际来源为准，展示新旧封面和影响范围，界面确认后由应用保存。", json!({"id":{"type":"string"},"source":{"type":"string","enum":["netease","discogs"]}}), json!(["id","source"])),
        tool("get_playback", "读取内置播放器当前状态；不开始播放。", json!({}), json!([])),
        tool("play_music", "仅在用户要求播放时，播放某收藏已关联数字专辑或独立单曲中的真实 songId；先核实目标及歌曲关联，不用未关联的搜索结果代替。账号权限不变。", json!({"id":{"type":"string"},"songId":{"type":"integer"}}), json!(["id","songId"])),
        tool("control_playback", "仅按用户明确指令暂停、继续、停止、跳转秒数或上下曲。next/previous 使用应用现有的有效网易云播放列表，沿用实体顺序、Disc 绑定及独立单曲关联，不自行重建。列表未就绪按错误提示处理。seek 须 seconds，其余 seconds=null。", json!({"action":{"type":"string","enum":["pause","resume","stop","seek","next","previous"]},"seconds":{"type":["number","null"]}}), json!(["action","seconds"])),
        tool(
            "search_library",
            "搜索本地收藏并返回精确数量、分币种总价。最多展示 30 条。",
            json!({"category":{"type":"string","enum":["music","video"]},"query":{"type":"string"},"status":{"type":["string","null"],"enum":["owned","wanted","transit",null]}}),
            json!(["category", "query", "status"])
        ),
        tool(
            "get_copy",
            "按真实副本 ID 读取版本和实体曲目 content、全部关联数字专辑 neteaseAlbums、现有分盘绑定 discAlbumLinks；netease 仅为兼容单专辑信息。未提供编辑绑定或独立单曲关联明细的能力，不读取私人备注或购买链接。",
            json!({"id":{"type":"string"}}),
            json!(["id"])
        ),
        tool(
            "search_discogs",
            "搜索 Discogs 发行。",
            json!({"query":{"type":"string"}}),
            json!(["query"])
        ),
        tool(
            "get_discogs_release",
            "读取指定 Discogs 发行。",
            json!({"id":{"type":"integer"}}),
            json!(["id"])
        ),
        tool(
            "search_netease",
            "在配置的 api-enhanced 服务搜索专辑。",
            json!({"query":{"type":"string"}}),
            json!(["query"])
        ),
        tool(
            "get_netease_album",
            "读取网易云专辑资料。",
            json!({"id":{"type":"integer"}}),
            json!(["id"])
        ),
        tool(
            "propose_status",
            "提出一条收藏状态修改，必须等待用户在界面确认，不会直接写入。",
            json!({"id":{"type":"string"},"status":{"type":"string","enum":["owned","wanted","transit"]}}),
            json!(["id", "status"])
        )
    ])
}
pub fn parse<T: serde::de::DeserializeOwned>(arguments: &str) -> Result<T, AppError> {
    if arguments.len() > 4000 {
        return Err(AppError::new("tool", "工具参数过长。"));
    }
    serde_json::from_str(arguments).map_err(|_| AppError::new("tool", "工具参数与定义不符。"))
}
