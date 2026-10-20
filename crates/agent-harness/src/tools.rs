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

pub fn definitions() -> Value {
    let tool = |name: &str, description: &str, properties: Value, required: Value| json!({"type":"function","function":{"name":name,"description":description,"parameters":{"type":"object","properties":properties,"required":required,"additionalProperties":false}}});
    json!([
        tool(
            "search_library",
            "搜索本地收藏并返回精确数量、分币种总价。最多展示 30 条。",
            json!({"category":{"type":"string","enum":["music","video"]},"query":{"type":"string"},"status":{"type":["string","null"],"enum":["owned","wanted","transit",null]}}),
            json!(["category", "query", "status"])
        ),
        tool(
            "get_copy",
            "按真实副本 ID 读取版本、曲目和网易云补充资料；不读取私人备注或购买链接。",
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
