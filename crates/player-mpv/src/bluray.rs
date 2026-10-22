use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

/// Upper bound for an imported KEYDB.cfg. The file is a text key database,
/// not a disc image; larger input is rejected before it reaches libaacs.
pub const MAX_KEYDB_BYTES: usize = 128 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecryptionFailure {
    MissingAacs,
    MissingBdPlus,
    AacsKeys,
    Aacs2,
}

impl DecryptionFailure {
    pub fn message(self) -> &'static str {
        match self {
            Self::MissingAacs => "缺少 libaacs，无法解密这张蓝光。",
            Self::MissingBdPlus => "光盘使用 BD+，缺少 libbdplus。",
            Self::AacsKeys => "KEYDB.cfg 中没有适用于这张光盘的密钥，或密钥已失效。",
            Self::Aacs2 => "这张光盘使用 AACS2，当前本地解密库不支持。",
        }
    }
    pub fn is_decryption_capability(self) -> bool {
        true
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeydbStatus {
    pub configured: bool,
    pub bytes: u64,
    pub entries: usize,
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeydbImport {
    pub status: KeydbStatus,
    pub replaced_existing: bool,
    #[serde(default)]
    pub english_supplemented: bool,
}

/// `%APPDATA%\aacs\KEYDB.cfg` is the location libaacs reads on Windows.
/// We keep the imported copy there because libbluray does not expose a key-file
/// path to MPV; the user's selected source file is never modified.
pub fn keydb_path() -> Result<PathBuf, AppError> {
    let appdata = std::env::var_os("APPDATA")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::new("settings", "找不到 Windows 应用数据目录。"))?;
    Ok(PathBuf::from(appdata).join("aacs").join("KEYDB.cfg"))
}

pub fn status() -> Result<KeydbStatus, AppError> {
    let path = keydb_path()?;
    match fs::metadata(&path) {
        Ok(metadata) if metadata.is_file() => {
            let (sources, updated_at) = read_metadata(&path).unwrap_or_default();
            Ok(KeydbStatus {
                configured: true,
                bytes: metadata.len(),
                entries: count_entries(
                    &fs::read(&path)
                        .map_err(|_| AppError::new("settings", "无法读取已配置的 KEYDB.cfg。"))?,
                ),
                sources,
                updated_at,
            })
        }
        Ok(_) => Err(AppError::new("settings", "KEYDB.cfg 路径不是文件。")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(KeydbStatus {
            configured: false,
            bytes: 0,
            entries: 0,
            sources: Vec::new(),
            updated_at: None,
        }),
        Err(_) => Err(AppError::new("settings", "无法读取 KEYDB.cfg 状态。")),
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeydbMetadata {
    #[serde(default)]
    sources: Vec<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

fn metadata_path(keydb: &Path) -> Option<PathBuf> {
    keydb
        .parent()
        .map(|directory| directory.join(".discatelier-keydb.json"))
}

fn read_metadata(keydb: &Path) -> Option<(Vec<String>, Option<String>)> {
    let path = metadata_path(keydb)?;
    let bytes = fs::read(path).ok()?;
    if bytes.len() > 16 * 1024 {
        return None;
    }
    let metadata: KeydbMetadata = serde_json::from_slice(&bytes).ok()?;
    let mut sources = Vec::new();
    for source in metadata.sources {
        if ["japanese", "english", "manual"].contains(&source.as_str())
            && !sources.contains(&source)
        {
            sources.push(source);
        }
    }
    Some((sources, metadata.updated_at))
}

/// Persist only non-secret provenance labels for the imported key database.
pub fn record_sources(sources: &[&str]) -> Result<(), AppError> {
    let keydb = keydb_path()?;
    let path =
        metadata_path(&keydb).ok_or_else(|| AppError::new("settings", "KEYDB.cfg 路径无效。"))?;
    let mut labels = Vec::new();
    for source in sources {
        if ["japanese", "english", "manual"].contains(source)
            && !labels.contains(&source.to_string())
        {
            labels.push((*source).to_string());
        }
    }
    let metadata = KeydbMetadata {
        sources: labels,
        updated_at: Some(chrono::Utc::now().to_rfc3339()),
    };
    let bytes = serde_json::to_vec(&metadata)
        .map_err(|_| AppError::new("settings", "无法生成 KEYDB 来源记录。"))?;
    let directory = path
        .parent()
        .ok_or_else(|| AppError::new("settings", "KEYDB.cfg 路径无效。"))?;
    fs::create_dir_all(directory)
        .map_err(|_| AppError::new("settings", "无法创建 libaacs 配置目录。"))?;
    let temporary = directory.join(format!(".keydb-meta-{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temporary, bytes)
        .map_err(|_| AppError::new("settings", "无法写入 KEYDB 来源记录。"))?;
    fs::rename(&temporary, &path).map_err(|_| {
        let _ = fs::remove_file(&temporary);
        AppError::new("settings", "无法保存 KEYDB 来源记录。")
    })
}

/// Validate and atomically replace the libaacs key database.
/// The previous file, if any, is retained as `KEYDB.cfg.discatelier.bak`.
pub fn import(bytes: &[u8]) -> Result<KeydbImport, AppError> {
    import_at(&keydb_path()?, bytes)
}

fn import_at(target: &Path, bytes: &[u8]) -> Result<KeydbImport, AppError> {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let entries = validate(bytes)?;
    let directory = target
        .parent()
        .ok_or_else(|| AppError::new("settings", "KEYDB.cfg 路径无效。"))?;
    fs::create_dir_all(directory)
        .map_err(|_| AppError::new("settings", "无法创建 libaacs 配置目录。"))?;
    let replaced_existing = target.is_file();
    if replaced_existing {
        let backup = directory.join("KEYDB.cfg.discatelier.bak");
        fs::copy(target, &backup)
            .map_err(|_| AppError::new("settings", "无法备份已有 KEYDB.cfg。"))?;
    }
    let temporary = directory.join(format!("KEYDB.cfg.tmp-{}", uuid::Uuid::new_v4()));
    let result = (|| -> Result<(), AppError> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|_| AppError::new("settings", "无法写入 KEYDB.cfg。"))?;
        file.write_all(bytes)
            .map_err(|_| AppError::new("settings", "无法写入 KEYDB.cfg。"))?;
        file.sync_all()
            .map_err(|_| AppError::new("settings", "无法同步 KEYDB.cfg。"))?;
        fs::rename(&temporary, target)
            .map_err(|_| AppError::new("settings", "无法替换 KEYDB.cfg。"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result?;
    Ok(KeydbImport {
        status: KeydbStatus {
            configured: true,
            bytes: bytes.len() as u64,
            entries,
            sources: Vec::new(),
            updated_at: None,
        },
        replaced_existing,
        english_supplemented: false,
    })
}

/// Merge language variants of the FindVUK database. Japanese entries are
/// primary (their human-readable titles win); English supplies discs that are
/// absent from the Japanese file. Decryption fields are not rewritten.
pub fn merge_keydb(primary: &[u8], supplemental: &[u8]) -> Result<Vec<u8>, AppError> {
    validate(primary)?;
    validate(supplemental)?;
    let primary = std::str::from_utf8(primary)
        .map_err(|_| AppError::new("validation", "日语 KEYDB.cfg 不是 UTF-8。"))?;
    let supplemental = std::str::from_utf8(supplemental)
        .map_err(|_| AppError::new("validation", "英语 KEYDB.cfg 不是 UTF-8。"))?;
    let mut discs = HashSet::new();
    let mut other = HashSet::new();
    let mut output = String::with_capacity(primary.len() + 1024 * 1024);
    for line in primary.lines() {
        if let Some(id) = disc_id(line) {
            discs.insert(id);
        } else {
            other.insert(line.to_owned());
        }
        output.push_str(line);
        output.push('\n');
    }
    for line in supplemental.lines() {
        if let Some(id) = disc_id(line) {
            if !discs.insert(id) {
                continue;
            }
        } else if line.trim().is_empty() || other.contains(line) {
            continue;
        }
        output.push_str(line);
        output.push('\n');
    }
    if !output.ends_with('\n') {
        output.push('\n');
    }
    Ok(output.into_bytes())
}

fn disc_id(line: &str) -> Option<String> {
    let line = line.trim_start();
    let line = line
        .strip_prefix("0x")
        .or_else(|| line.strip_prefix("0X"))?;
    if line.len() < 40 || !line.as_bytes()[..40].iter().all(u8::is_ascii_hexdigit) {
        return None;
    }
    let rest = line[40..].trim_start();
    rest.starts_with('=')
        .then(|| line[..40].to_ascii_uppercase())
}

pub fn validate(bytes: &[u8]) -> Result<usize, AppError> {
    if bytes.is_empty() {
        return Err(AppError::new("validation", "KEYDB.cfg 为空。"));
    }
    if bytes.len() > MAX_KEYDB_BYTES {
        return Err(AppError::new("validation", "KEYDB.cfg 超过 8 MiB 限制。"));
    }
    if bytes.contains(&0) {
        return Err(AppError::new("validation", "KEYDB.cfg 含有二进制内容。"));
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| AppError::new("validation", "KEYDB.cfg 不是 UTF-8 文本。"))?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let entries = count_entries(text.as_bytes());
    if entries == 0 {
        return Err(AppError::new(
            "validation",
            "KEYDB.cfg 中没有可识别的密钥条目。",
        ));
    }
    for line in text.lines() {
        if line.len() > 16_384 {
            return Err(AppError::new("validation", "KEYDB.cfg 中存在过长的行。"));
        }
        if line
            .chars()
            .any(|c| c.is_ascii_control() && c != '\t' && c != '\r')
        {
            return Err(AppError::new(
                "validation",
                "KEYDB.cfg 含有 ASCII 控制字符。",
            ));
        }
    }
    Ok(entries)
}

fn count_entries(bytes: &[u8]) -> usize {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return 0;
    };
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    text.lines()
        .filter(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with(';') || line.starts_with('#') {
                return false;
            }
            let hex = line.bytes().filter(|byte| byte.is_ascii_hexdigit()).count();
            hex >= 32 && (line.contains('|') || line.contains('='))
        })
        .count()
}

/// Classify only decryption-capability failures. Read errors, removed media
/// and user stops deliberately return `None` so they cannot trigger fallback.
pub fn classify_decryption(error: &str, log: &str) -> Option<DecryptionFailure> {
    let text = format!("{error}\n{log}").to_ascii_lowercase();
    if text.contains("region mismatch")
        || text.contains("region code")
        || text.contains("wrong region")
    {
        return None;
    }
    if text.contains("failed to read unit key file")
        || text.contains("corrupt disc")
        || text.contains("failed opening mmc device")
        || text.contains("mmc failure")
        || text.contains("no such device")
        || text.contains("media changed")
    {
        return None;
    }
    if text.contains("cannot find libaacs")
        || text.contains("libaacs not found")
        || text.contains("missing libaacs")
        || (text.contains("can't open library") && text.contains("libaacs"))
    {
        return Some(DecryptionFailure::MissingAacs);
    }
    if text.contains("cannot find libbdplus")
        || text.contains("libbdplus not found")
        || text.contains("missing libbdplus")
        || text.contains("bd+ encryption detected")
        || text.contains("bdplus")
        || (text.contains("can't open library") && text.contains("libbdplus"))
    {
        return Some(DecryptionFailure::MissingBdPlus);
    }
    if text.contains("disc is using aacs2")
        || text.contains("unsupported aacs version")
        || text.contains("aacs2")
    {
        return Some(DecryptionFailure::Aacs2);
    }
    if text.contains("no valid aacs configuration files found")
        || text.contains("missing configuration file")
        || text.contains("no matching processing key")
        || text.contains("no matching device key")
        || text.contains("aacs_open() failed")
        || text.contains("failed to initialize aacs")
        || text.contains("failed to decrypt")
        || text.contains("decrypting unit key failed")
        || text.contains("decrypting vuk failed")
        || text.contains("aacs error")
    {
        return Some(DecryptionFailure::AacsKeys);
    }
    None
}

/// Fallback is permitted only for a positively identified decryption-capability
/// failure, with the user's switch on and a usable MakeMKV library.
pub fn fallback_decision(
    error: &str,
    log: &str,
    enabled: bool,
    library_available: bool,
) -> Option<DecryptionFailure> {
    if !enabled || !library_available {
        return None;
    }
    classify_decryption(error, log)
}

/// A short user-facing report for non-fallback failures.
pub fn report(error: &str, log: &str) -> Option<&'static str> {
    let text = format!("{error}\n{log}").to_ascii_lowercase();
    if text.contains("region mismatch") || text.contains("wrong region") {
        return Some("这张蓝光的光盘区域与播放器区域不一致，未尝试兜底。");
    }
    if text.contains("bd-j") || text.contains("bdj") {
        return Some("检测到 BD-J 内容；当前直接播放主播放列表，不提供蓝光菜单导航。");
    }
    None
}

pub fn is_file(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_and_oversized_key_databases() {
        assert!(validate(b"").is_err());
        assert!(validate(b"\0\0").is_err());
    }

    #[test]
    fn accepts_standard_keydb_lines_and_counts_entries() {
        let text = b"; comment\n0x0123456789ABCDEF0123456789ABCDEF01234567 = 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF\n";
        assert_eq!(validate(text).unwrap(), 1);
        // Legacy FindVUK titles contain valid UTF-8 C1 controls; they are text,
        // not binary, and must not make a real database unimportable.
        let with_c1 = b"0x0123456789ABCDEF0123456789ABCDEF01234567 = 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF ; \xc2\x90\n";
        assert_eq!(validate(with_c1).unwrap(), 1);
    }

    #[test]
    fn rejects_random_text_and_null_bytes() {
        assert!(validate(b"not a keydb\n").is_err());
        assert!(validate(b"0x0123456789abcdef0123456789abcdef01234567 = x\0").is_err());
    }

    #[test]
    fn classifies_aacs_but_not_read_errors_or_region_mismatch() {
        assert_eq!(
            classify_decryption("", "AACS encryption detected but cannot find libaacs."),
            Some(DecryptionFailure::MissingAacs)
        );
        assert_eq!(
            classify_decryption("", "No valid AACS configuration files found"),
            Some(DecryptionFailure::AacsKeys)
        );
        assert_eq!(
            classify_decryption("", "disc is using AACS2"),
            Some(DecryptionFailure::Aacs2)
        );
        assert_eq!(classify_decryption("光盘读取失败", "No such device"), None);
        assert_eq!(classify_decryption("", "region mismatch"), None);
        assert_eq!(
            classify_decryption("", "BD+ encryption detected but cannot find libbdplus."),
            Some(DecryptionFailure::MissingBdPlus)
        );
    }

    #[test]
    fn japanese_titles_win_and_english_fills_missing_discs() {
        let jp = b"; jp\n| DK | DEVICE_KEY 0x5FB86EF127C19C171E799F61C27BDC2A | DEVICE_NODE 0x0800\n0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA = #LF#LJAPANESE | V | 0x00112233445566778899AABBCCDDEEFF\n";
        let en = b"; en\n| DK | DEVICE_KEY 0x5FB86EF127C19C171E799F61C27BDC2A | DEVICE_NODE 0x0800\n0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA = #LF#LENGLISH | V | 0x00112233445566778899AABBCCDDEEFF\n0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB = #LF#LENGLISH-ONLY | V | 0x00112233445566778899AABBCCDDEEFF\n";
        let merged = String::from_utf8(merge_keydb(jp, en).unwrap()).unwrap();
        assert!(merged.contains("LJAPANESE"));
        assert!(!merged.contains("LENGLISH |"));
        assert!(merged.contains("LENGLISH-ONLY"));
        assert_eq!(
            merged
                .matches("0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA =")
                .count(),
            1
        );
        assert_eq!(merged.matches("| DK |").count(), 1);
    }

    #[test]
    fn import_copies_atomically_and_keeps_a_backup() {
        let root = std::env::temp_dir().join(format!("discatelier-keydb-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let target = root.join("KEYDB.cfg");
        let first = b"0x0123456789ABCDEF0123456789ABCDEF01234567 = 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF\n";
        assert!(!import_at(&target, first).unwrap().replaced_existing);
        assert_eq!(std::fs::read(&target).unwrap(), first);
        let second = b"0x89ABCDEF0123456789ABCDEF0123456789ABCDEF = 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF | 0x00112233445566778899AABBCCDDEEFF\n";
        assert!(import_at(&target, second).unwrap().replaced_existing);
        assert_eq!(std::fs::read(&target).unwrap(), second);
        assert_eq!(
            std::fs::read(root.join("KEYDB.cfg.discatelier.bak")).unwrap(),
            first
        );
        for path in [target, root.join("KEYDB.cfg.discatelier.bak")] {
            let _ = std::fs::remove_file(path);
        }
        let _ = std::fs::remove_dir(root);
    }

    #[test]
    fn fallback_requires_both_a_decryption_failure_and_the_switch() {
        let aacs = "No valid AACS configuration files found";
        assert_eq!(
            fallback_decision("", aacs, true, true),
            Some(DecryptionFailure::AacsKeys)
        );
        assert_eq!(fallback_decision("", aacs, false, true), None);
        assert_eq!(fallback_decision("", aacs, true, false), None);
        assert_eq!(
            fallback_decision("光盘读取失败", "No such device", true, true),
            None
        );
        assert_eq!(fallback_decision("已停止。", "", true, true), None);
        assert_eq!(fallback_decision("", "region mismatch", true, true), None);
        assert_eq!(
            fallback_decision(
                "",
                "Failed to read unit key file (AACS/Unit_Key_RO.inf)\nNo valid AACS configuration files found",
                true,
                true
            ),
            None
        );
    }
}
