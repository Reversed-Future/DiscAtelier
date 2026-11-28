//! Select the installed library before Tauri opens the first WebView2 profile.
use crate::data_location::set_directory;
use std::{
    fs::{self, File, Metadata},
    io::{self, ErrorKind},
    os::windows::{ffi::OsStrExt, fs::MetadataExt},
    path::{Path, PathBuf},
};
use windows::{
    core::{w, HSTRING},
    Win32::{
        Foundation::{CloseHandle, WAIT_ABANDONED, WAIT_OBJECT_0},
        System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject, INFINITE},
        UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK},
    },
};
use windows_sys::Win32::Storage::FileSystem::{
    MoveFileExW, FILE_ATTRIBUTE_REPARSE_POINT, MOVEFILE_WRITE_THROUGH,
};

const ORIGINAL: &str = "com.reversedfuture.discatelier";
const PREFERRED: &str = "DiscAtelier";
// Created exclusively in the original directory. The marker and every data file
// arrive at the destination in one rename, even if the process is interrupted.
const MARKER: &str = ".discatelier-user-data-v1";

pub fn configure(config: &mut tauri::Config) -> io::Result<()> {
    #[cfg(any(debug_assertions, feature = "performance-harness"))]
    if let Some(path) = std::env::var_os("DISCATELIER_TEST_DATA_DIR") {
        set_directory(config, PathBuf::from(path));
        return Ok(());
    }
    let root =
        dirs::data_local_dir().ok_or_else(|| io::Error::other("无法定位本地应用数据目录"))?;
    set_directory(config, select(&root, &std::env::current_exe()?)?);
    Ok(())
}

pub fn report_error(error: &io::Error) {
    let message = HSTRING::from(format!(
        "无法确定收藏数据目录。请检查文件夹权限后重新打开 DiscAtelier。\n\n{error}"
    ));
    unsafe { MessageBoxW(None, &message, w!("DiscAtelier"), MB_OK | MB_ICONERROR) };
}

fn select(root: &Path, executable: &Path) -> io::Result<PathBuf> {
    // Distinct copies of the executable can launch concurrently in the same session.
    let lock = unsafe { CreateMutexW(None, false, w!(r"Local\DiscAtelier-UserDataRename-v1")) }?;
    let wait = unsafe { WaitForSingleObject(lock, INFINITE) };
    let result = if wait == WAIT_OBJECT_0 || wait == WAIT_ABANDONED {
        let result = select_directory(root, executable);
        let _ = unsafe { ReleaseMutex(lock) };
        result
    } else {
        Err(io::Error::last_os_error())
    };
    let _ = unsafe { CloseHandle(lock) };
    result
}

fn inspect(path: &Path) -> io::Result<Option<Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(info) => Ok(Some(info)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

fn plain_directory(info: &Metadata) -> bool {
    info.is_dir() && info.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
}

fn marked(directory: &Path) -> io::Result<bool> {
    Ok(inspect(&directory.join(MARKER))?.is_some_and(|info| {
        info.is_file()
            && info.len() == 0
            && info.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0
    }))
}

fn mark(directory: &Path) -> io::Result<()> {
    match File::create_new(directory.join(MARKER)) {
        Ok(file) => file.sync_all(),
        Err(error) if error.kind() == ErrorKind::AlreadyExists && marked(directory)? => Ok(()),
        Err(error) => Err(error),
    }
}

fn rename_if_vacant(from: &Path, to: &Path) -> io::Result<()> {
    let wide = |path: &Path| {
        path.as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<_>>()
    };
    let (from, to) = (wide(from), wide(to));
    // Same parent/volume. Never replace even an empty directory or file that
    // appeared since inspection. No file-by-file fallback or cross-volume copy.
    if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_WRITE_THROUGH) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

fn select_directory(root: &Path, executable: &Path) -> io::Result<PathBuf> {
    let original = root.join(ORIGINAL);
    let preferred = root.join(PREFERRED);
    let source = inspect(&original)?;
    match inspect(&preferred) {
        Ok(Some(target)) => {
            if !plain_directory(&target) {
                return Ok(original);
            }
            let use_migrated = match source {
                None => marked(&preferred)?,
                Some(info) => {
                    plain_directory(&info)
                        && fs::read_dir(&original).is_ok_and(|mut entries| entries.next().is_none())
                        && marked(&preferred).unwrap_or(false)
                }
            };
            return Ok(if use_migrated { preferred } else { original });
        }
        Err(_) if source.is_some() => return Ok(original),
        Err(error) => return Err(error),
        Ok(None) => {}
    }
    match source {
        Some(info) => {
            // A custom installation may itself be inside the original data root.
            let can_move = plain_directory(&info)
                && fs::canonicalize(&original).is_ok_and(|dir| {
                    fs::canonicalize(executable).is_ok_and(|exe| !exe.starts_with(dir))
                });
            if !can_move {
                return Ok(original);
            }
        }
        None => fs::create_dir(&original)?,
    }
    if mark(&original)
        .and_then(|()| rename_if_vacant(&original, &preferred))
        .is_ok()
    {
        return Ok(preferred);
    }
    // A locked database/profile, lack of rename rights, or an occupied target
    // leaves the complete original directory in place for this launch.
    if inspect(&original)?.is_some() {
        return Ok(original);
    }
    if inspect(&preferred)?.as_ref().is_some_and(plain_directory) && marked(&preferred)? {
        return Ok(preferred);
    }
    Err(io::Error::other(
        "收藏目录在启动期间发生变化，请重新打开应用。",
    ))
}

#[cfg(test)]
mod tests;
