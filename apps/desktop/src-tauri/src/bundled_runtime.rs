use std::path::PathBuf;
use tauri::Manager;

/// The installer places VLC under `vlc/` and the Temurin JRE under `jre/`.
/// Keep both paths inside the installation; never depend on a system VLC/Java.
pub fn vlc_library(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app
        .path()
        .resource_dir()
        .ok()?
        .join("vlc")
        .join("libvlc.dll");
    path.is_file().then_some(path)
}

pub fn configure(app: &tauri::AppHandle) {
    let root = app.path().resource_dir().ok();
    let Some(root) = root else { return };
    let vlc = root.join("vlc");
    let mut paths = Vec::new();
    if vlc.join("libvlc.dll").is_file() {
        std::env::set_var("VLC_PLUGIN_PATH", vlc.join("plugins"));
        let aacs = vlc.join("libaacs.dll");
        let bdplus = vlc.join("libbdplus.dll");
        if aacs.is_file() {
            std::env::set_var("LIBAACS_PATH", aacs.with_extension(""));
        }
        if bdplus.is_file() {
            std::env::set_var("LIBBDPLUS_PATH", bdplus.with_extension(""));
        }
        paths.push(vlc);
    }
    let mpv = root.join("mpv").join("mpv.exe");
    if mpv.is_file() {
        std::env::set_var("DISCATELIER_MPV", &mpv);
    }
    let java = root.join("jre");
    if java.join("bin").join("java.exe").is_file() {
        std::env::set_var("JAVA_HOME", &java);
        paths.push(java.join("bin"));
    }
    if !paths.is_empty() {
        if let Some(current) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&current));
        }
        if let Ok(joined) = std::env::join_paths(paths) {
            std::env::set_var("PATH", joined);
        }
    }
}
