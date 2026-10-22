use reqwest::blocking::ClientBuilder;

// Prefer the user's enabled Windows proxy over inherited shell environment proxies.
// Read-only; other settings and protocols retain reqwest's existing behavior.
pub(super) fn configure(builder: ClientBuilder) -> ClientBuilder {
    #[cfg(target_os = "windows")]
    if let Ok(settings) = windows_registry::CURRENT_USER
        .open("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
    {
        if settings.get_u32("ProxyEnable").unwrap_or(0) == 1 {
            if let Ok(server) = settings.get_string("ProxyServer") {
                if let Some(proxy) = single_proxy(&server) {
                    let bypass = settings.get_string("ProxyOverride").unwrap_or_default();
                    // Same domain-list normalization as hyper-util's Windows matcher.
                    // This client only requests the fixed public API hostnames.
                    let bypass = bypass.replace(';', ",").replace("*.", "");
                    return builder
                        .no_proxy()
                        .proxy(proxy.no_proxy(reqwest::NoProxy::from_string(&bypass)));
                }
            }
        }
    }
    builder
}

#[cfg(any(target_os = "windows", test))]
fn single_proxy(server: &str) -> Option<reqwest::Proxy> {
    // Windows' single-server form is the one recorded on this machine. Do not
    // reinterpret protocol maps or unsupported configuration formats.
    if server.is_empty() || server.contains(';') || server.contains('=') {
        return None;
    }
    reqwest::Proxy::https(server).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_single_server_without_reinterpreting_protocol_maps() {
        assert!(single_proxy("127.0.0.1:7890").is_some());
        assert!(single_proxy("http://127.0.0.1:7890").is_some());
        assert!(single_proxy("").is_none());
        assert!(single_proxy("http=127.0.0.1:7890;https=127.0.0.1:7890").is_none());
    }
}
