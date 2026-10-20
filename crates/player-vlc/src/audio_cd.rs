use discatelier_contracts::{AppError, PlaybackSource};

/// App-defined track route. It cannot carry arbitrary VLC options or a file URL.
pub fn cd_track(route: &str) -> Option<u8> {
    let number = route.strip_prefix("cd-track:")?.parse::<u8>().ok()?;
    (number > 0 && number <= 99 && route == format!("cd-track:{number}")).then_some(number)
}
pub fn location(source: &PlaybackSource) -> Result<(String, u8), AppError> {
    let mount = source.mount_point.as_bytes();
    let track = cd_track(&source.playlist).ok_or_else(|| crate::ffi::error("CD 曲目无效。"))?;
    if mount.len() != 2 || !mount[0].is_ascii_uppercase() || mount[1] != b':' {
        return Err(crate::ffi::error("CD 光驱路径无效。"));
    }
    Ok((format!("cdda:///{}/", source.mount_point), track))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn track_routes_are_bounded_and_exact() {
        for bad in [
            "cd-track:0",
            "cd-track:100",
            "cd-track:01",
            "cd-track:+1",
            "cd-track:1 --sout",
            "CD-track:1",
        ] {
            assert_eq!(cd_track(bad), None);
        }
        assert_eq!(cd_track("cd-track:99"), Some(99));
    }
}
