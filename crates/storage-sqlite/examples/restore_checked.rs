//! Operational recovery using the same validation and backup path as the UI.
use discatelier_application::LibraryRepository;
use discatelier_storage::SqliteLibrary;
use std::path::Path;

fn main() {
    if let Err(message) = run() {
        eprintln!("{message}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 4 || !matches!(args[0].as_str(), "check" | "restore") {
        return Err("Usage: restore_checked <check|restore> <backup> <destination-directory> <expected-copy-count>".into());
    }
    let expected: i64 = args[3].parse().map_err(|_| "Invalid count")?;
    if expected <= 0 || !Path::new(&args[1]).is_absolute() || !Path::new(&args[2]).is_absolute() {
        return Err("Require absolute paths and a positive expected count".into());
    }
    // For check mode, callers must provide a fresh scratch directory.
    if args[0] == "check" && Path::new(&args[2]).exists() {
        return Err("Check destination already exists".into());
    }
    let mut library = SqliteLibrary::open(Path::new(&args[2])).map_err(|e| e.message)?;
    let preview = library.prepare_restore(&args[1]).map_err(|e| e.message)?;
    if preview.copies != expected {
        return Err("The checked backup does not have the expected collection count".into());
    }
    println!(
        "{}",
        serde_json::json!({"validated":true,"copies":preview.copies,"editions":preview.editions,"assets":preview.assets,"models":preview.models})
    );
    if args[0] == "restore" {
        let saved = library.restore(&preview.token).map_err(|e| e.message)?;
        println!(
            "{}",
            serde_json::json!({"restored":true,"previousDatabaseBackup":saved})
        );
    }
    Ok(())
}
