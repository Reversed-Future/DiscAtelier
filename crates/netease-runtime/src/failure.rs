use discatelier_contracts::AppError;
use serde_json::Value;

// These fields are our private pipe protocol, not unchecked upstream messages.
pub fn from_response(response: &Value) -> AppError {
    let label = match response.get("errorCode").and_then(Value::as_str) {
        Some("NETEASE_PLAYBACK_INIT") => {
            match response.get("errorReason").and_then(Value::as_str) {
                Some("key_response") => "网易云播放初始化失败：公钥接口未返回有效数据",
                Some("key_signature") => "网易云播放初始化失败：公钥响应签名不匹配",
                Some("key_missing") => "网易云播放初始化失败：公钥响应缺少必要字段",
                Some("cache_write") => "网易云播放初始化失败：无法写入本地缓存",
                Some("timeout") => "网易云播放初始化超时，请检查网络后重试",
                _ => "网易云播放初始化失败：公钥请求未完成",
            }
        }
        Some("NETEASE_PLAYBACK_REQUEST") => "网易云播放请求失败",
        Some("NETEASE_COMPONENT_LOAD") => "内置网易云组件加载失败，请使用完整新版程序",
        _ => return super::error("内置网易云查询失败，请稍后重试。"),
    };
    let suffix = response
        .get("errorStatus")
        .and_then(Value::as_u64)
        .filter(|n| (400..=599).contains(n))
        .map(|n| format!("（HTTP {n}）"))
        .unwrap_or_default();
    super::error(&format!("{label}{suffix}。"))
}
