use super::{
    download::{Download, DownloadSource},
    error, Jobs,
};
use crate::data_location::DataLocation;
use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};

#[derive(Serialize)]
pub struct Model {
    pub id: &'static str,
    pub bytes: u64,
    #[serde(skip)]
    pub(super) sha: &'static str,
}
const MODELS: &[Model] = &[
    Model {
        id: "tiny",
        bytes: 77691713,
        sha: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    },
    Model {
        id: "base",
        bytes: 147951465,
        sha: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    },
    Model {
        id: "small",
        bytes: 487601967,
        sha: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    },
    Model {
        id: "medium",
        bytes: 1533763059,
        sha: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
    },
    Model {
        id: "large-v3-turbo",
        bytes: 1624555275,
        sha: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
    },
    Model {
        id: "large-v3",
        bytes: 3095033483,
        sha: "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",
    },
];
#[derive(Clone, Serialize, Deserialize)]
pub struct Preferences {
    #[serde(default, rename = "downloadSource")]
    pub download_source: DownloadSource,
    pub model: String,
    pub language: String,
    pub bilingual: bool,
    #[serde(default)]
    pub appearance: super::appearance::Appearance,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            download_source: DownloadSource::default(),
            model: "base".into(),
            language: "ja".into(),
            bilingual: true,
            appearance: Default::default(),
        }
    }
}
pub(super) fn model(id: &str) -> Result<&'static Model, AppError> {
    MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| error("请选择列表中的 Whisper 模型。"))
}
fn validate(p: &Preferences) -> Result<(), AppError> {
    model(&p.model)?;
    p.appearance.validate()?;
    if !["ja", "en", "zh", "auto"].contains(&p.language.as_str()) {
        return Err(error("不支持所选识别语言。"));
    }
    Ok(())
}
pub fn read(root: &Path) -> Result<Preferences, AppError> {
    match std::fs::read(root.join("subtitle-settings.json")) {
        Ok(bytes) => {
            let p = serde_json::from_slice(&bytes).map_err(|_| error("字幕设置格式错误。"))?;
            validate(&p)?;
            Ok(p)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
        Err(_) => Err(error("无法读取字幕设置。")),
    }
}
pub(super) fn path(root: &Path, m: &Model) -> PathBuf {
    root.join("whisper-models")
        .join(format!("ggml-{}.bin", m.id))
}
pub(super) fn installed(root: &Path, m: &Model) -> bool {
    path(root, m)
        .metadata()
        .is_ok_and(|s| s.is_file() && s.len() == m.bytes)
}
pub fn selected(root: &Path, p: &Preferences) -> Result<PathBuf, AppError> {
    let m = model(&p.model)?;
    if !installed(root, m) {
        return Err(error("请在设置 → AI 字幕中下载选定的 Whisper 模型。"));
    }
    Ok(path(root, m))
}
#[derive(Serialize)]
pub struct Status {
    preferences: Preferences,
    models: &'static [Model],
    installed: Vec<&'static str>,
}
#[tauri::command]
pub fn subtitle_settings(directory: tauri::State<'_, DataLocation>) -> Result<Status, AppError> {
    Ok(Status {
        preferences: read(&directory.0)?,
        models: MODELS,
        installed: MODELS
            .iter()
            .filter(|m| installed(&directory.0, m))
            .map(|m| m.id)
            .collect(),
    })
}
#[tauri::command]
pub fn subtitle_settings_save(
    directory: tauri::State<'_, DataLocation>,
    preferences: Preferences,
) -> Result<(), AppError> {
    validate(&preferences)?;
    let err = || error("无法保存字幕设置。");
    let mut file = tempfile::NamedTempFile::new_in(&directory.0).map_err(|_| err())?;
    serde_json::to_writer(file.as_file_mut(), &preferences).map_err(|_| err())?;
    file.persist(directory.0.join("subtitle-settings.json"))
        .map_err(|_| err())?;
    Ok(())
}
#[tauri::command]
pub fn subtitle_uninstall(
    directory: tauri::State<'_, DataLocation>,
    state: tauri::State<'_, Download>,
    jobs: tauri::State<'_, Jobs>,
    id: String,
) -> Result<(), AppError> {
    let target = path(&directory.0, model(&id)?);
    let _operation = state.lock()?;
    let active = jobs.0.lock().map_err(|_| error("字幕服务不可用。"))?;
    if active.as_ref().is_some_and(|job| job.model_id == id) {
        return Err(error("这个模型正在生成字幕，请先关闭 AI 字幕。"));
    }
    match std::fs::remove_file(target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(error("无法卸载模型，请检查文件是否被占用。")),
    }
}
#[tauri::command]
pub async fn subtitle_import(
    directory: tauri::State<'_, DataLocation>,
    state: tauri::State<'_, Download>,
    id: String,
    file: String,
) -> Result<(), AppError> {
    let m = model(&id)?;
    let _operation = state.lock()?;
    let target = path(&directory.0, m);
    tauri::async_runtime::spawn_blocking(move || {
        let mut input = std::fs::File::open(file).map_err(|_| error("无法读取模型文件。"))?;
        if input
            .metadata()
            .map_err(|_| error("无法读取模型大小。"))?
            .len()
            != m.bytes
        {
            return Err(error(format!("请选择所选版本的 ggml-{}.bin。", m.id)));
        }
        let dir = target.parent().unwrap();
        std::fs::create_dir_all(dir).map_err(|_| error("无法创建模型目录。"))?;
        let mut out =
            tempfile::NamedTempFile::new_in(dir).map_err(|_| error("无法写入模型目录。"))?;
        let mut buf = vec![0; 256 * 1024];
        let mut hash = Sha256::new();
        let mut size = 0;
        loop {
            let n = input.read(&mut buf).map_err(|_| error("读取模型中断。"))?;
            if n == 0 {
                break;
            }
            size += n as u64;
            if size > m.bytes {
                return Err(error("模型大小校验失败。"));
            }
            hash.update(&buf[..n]);
            out.write_all(&buf[..n])
                .map_err(|_| error("保存模型失败，请检查磁盘空间。"))?;
        }
        if size != m.bytes || format!("{:x}", hash.finalize()) != m.sha {
            return Err(error("模型 SHA-256 不匹配，请选择官方多语言模型。"));
        }
        out.persist(target).map_err(|_| error("无法保存模型。"))?;
        Ok(())
    })
    .await
    .map_err(|_| error("模型导入中断。"))?
}
