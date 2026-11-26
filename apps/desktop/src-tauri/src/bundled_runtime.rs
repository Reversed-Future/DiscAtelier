use std::path::{Path, PathBuf};
use tauri::Manager;

/// libbluray looks for `libbluray-j2se-<version>.jar` next to its own library
/// or in `../share/java`. VLC statically links libbluray into a plugin, so that
/// lookup can resolve to the application directory and miss the jar shipped in
/// `vlc/plugins/access`. An explicit `LIBBLURAY_CP` keeps BD-J menus working.
/// `resource_dir()` can be a verbatim `\\?\` path. Native libraries and
/// third-party loaders do not consistently accept that prefix, so environment
/// values handed to VLC/MPV/libbluray use the ordinary Win32 form.
/// `std::env::set_var` updates the Win32 environment block, but libbluray's
/// C `getenv()` reads the CRT copy created at process startup. Publish native
/// library paths through `_wputenv_s` as well so in-process VLC sees them.
fn set_native_env(name: &str, value: &str) {
    std::env::set_var(name, value);
    #[cfg(target_os = "windows")]
    unsafe {
        use windows_sys::core::w;
        use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
        type WidePutenv = unsafe extern "C" fn(*const u16, *const u16) -> i32;
        let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let name = wide(name);
        let value = wide(value);
        // VLC's libbluray plugin uses msvcrt, while Rust itself uses the
        // UCRT. Publish to both CRT environments.
        for module_name in [w!("ucrtbase.dll"), w!("msvcrt.dll")] {
            let module = LoadLibraryW(module_name);
            if module.is_null() {
                continue;
            }
            let Some(address) = GetProcAddress(module, b"_wputenv_s\0".as_ptr()) else {
                continue;
            };
            let function: WidePutenv = std::mem::transmute(address);
            let _ = function(name.as_ptr(), value.as_ptr());
        }
    }
}

fn plain(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

fn bluray_classpath(vlc: &Path) -> Option<PathBuf> {
    let access = vlc.join("plugins").join("access");
    let entries = std::fs::read_dir(&access).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("libbluray-j2se-") && name.ends_with(".jar") && entry.path().is_file()
        {
            return Some(access);
        }
    }
    None
}

/// The installer places VLC under `vlc/` and the Temurin JRE under `jre/`.
/// Keep both paths inside the installation; never depend on a system VLC/Java.
pub fn vlc_library(app: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app
        .path()
        .resource_dir()
        .ok()?
        .join("vlc")
        .join("libvlc.dll");
    path.is_file().then(|| plain(path))
}

pub fn configure(app: &tauri::AppHandle) {
    let root = app.path().resource_dir().ok();
    let Some(root) = root else { return };
    let root = plain(root);
    let vlc = root.join("vlc");
    let mut paths = Vec::new();
    if vlc.join("libvlc.dll").is_file() {
        set_native_env(
            "VLC_PLUGIN_PATH",
            &vlc.join("plugins").to_string_lossy(),
        );
        let aacs = vlc.join("libaacs.dll");
        let bdplus = vlc.join("libbdplus.dll");
        if aacs.is_file() {
            set_native_env(
                "LIBAACS_PATH",
                &aacs.with_extension("").to_string_lossy(),
            );
        }
        if bdplus.is_file() {
            set_native_env(
                "LIBBDPLUS_PATH",
                &bdplus.with_extension("").to_string_lossy(),
            );
        }
        if let Some(access) = bluray_classpath(&vlc) {
            let mut classpath = access.to_string_lossy().into_owned();
            if !classpath.ends_with('\\') && !classpath.ends_with('/') {
                classpath.push('\\');
            }
            set_native_env("LIBBLURAY_CP", &classpath);
        }
        paths.push(vlc);
    }
    let mpv = root.join("mpv").join("mpv.exe");
    if mpv.is_file() {
        std::env::set_var("DISCATELIER_MPV", &mpv);
    }
    let java = root.join("jre");
    if java.join("bin").join("java.exe").is_file() {
        set_native_env("JAVA_HOME", &java.to_string_lossy());
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
    let _ = std::fs::write(
        std::env::temp_dir().join("discatelier-runtime-env.log"),
        format!(
            "LIBAACS_PATH={:?}\nLIBBDPLUS_PATH={:?}\nLIBBLURAY_CP={:?}\nJAVA_HOME={:?}\n",
            std::env::var("LIBAACS_PATH"),
            std::env::var("LIBBDPLUS_PATH"),
            std::env::var("LIBBLURAY_CP"),
            std::env::var("JAVA_HOME"),
        ),
    );
}
