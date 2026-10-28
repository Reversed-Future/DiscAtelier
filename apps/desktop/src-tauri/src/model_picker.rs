use discatelier_contracts::AppError;
use std::path::PathBuf;

/// Native chooser owns filesystem selection. No web-supplied path reaches here.
#[cfg(target_os = "windows")]
pub fn choose(owner: usize) -> Result<Option<PathBuf>, AppError> {
    #[cfg(any(debug_assertions, feature = "performance-harness"))]
    if let Some(selection) = test_selection()? {
        return Ok(selection);
    }
    use std::{ffi::OsString, os::windows::ffi::OsStringExt};
    use windows_sys::Win32::UI::Controls::Dialogs::{
        CommDlgExtendedError, GetOpenFileNameW, OFN_DONTADDTORECENT, OFN_EXPLORER,
        OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST, OPENFILENAMEW,
    };
    let mut path = vec![0_u16; 32768];
    let filter: Vec<u16> = "支持的三维模型\0*.ateliermodel;*.glb;*.obj;*.fbx;*.skp\0DiscAtelier 拆装模型\0*.ateliermodel\0GLB 模型\0*.glb\0OBJ 模型\0*.obj\0FBX 模型\0*.fbx\0SketchUp 模型\0*.skp\0\0"
        .encode_utf16()
        .collect();
    let title: Vec<u16> = "选择模型\0".encode_utf16().collect();
    let mut dialog = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        hwndOwner: owner as _,
        lpstrFilter: filter.as_ptr(),
        nFilterIndex: 1,
        lpstrFile: path.as_mut_ptr(),
        nMaxFile: path.len() as u32,
        lpstrTitle: title.as_ptr(),
        Flags: OFN_EXPLORER
            | OFN_FILEMUSTEXIST
            | OFN_PATHMUSTEXIST
            | OFN_NOCHANGEDIR
            | OFN_DONTADDTORECENT,
        ..Default::default()
    };
    // Buffers and owner handle outlive the modal synchronous system call.
    if unsafe { GetOpenFileNameW(&mut dialog) } == 0 {
        return if unsafe { CommDlgExtendedError() } == 0 {
            Ok(None)
        } else {
            Err(AppError::new("model", "无法打开模型文件选择器。"))
        };
    }
    let length = path
        .iter()
        .position(|value| *value == 0)
        .ok_or_else(|| AppError::new("model", "模型路径无效。"))?;
    Ok(Some(PathBuf::from(OsString::from_wide(&path[..length]))))
}

#[cfg(not(target_os = "windows"))]
pub fn choose(_: usize) -> Result<Option<PathBuf>, AppError> {
    Err(AppError::new("model", "当前模型文件选择器适用于 Windows。"))
}

// Isolated test runners substitute only the human selection step. Ordinary
// Release does not compile this branch or read the test directory environment.
#[cfg(any(debug_assertions, feature = "performance-harness"))]
fn test_selection() -> Result<Option<Option<PathBuf>>, AppError> {
    let Some(directory) = std::env::var_os("DISCATELIER_TEST_DATA_DIR") else {
        return Ok(None);
    };
    match std::fs::read_to_string(PathBuf::from(directory).join("model-selection.txt")) {
        Ok(path) => Ok(Some(if path.is_empty() {
            None
        } else {
            Some(PathBuf::from(path))
        })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(AppError::new("model", "无法读取测试文件选择。")),
    }
}
