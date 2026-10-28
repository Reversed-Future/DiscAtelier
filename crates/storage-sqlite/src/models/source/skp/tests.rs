//! Optional external corpus validation; never includes user models or third-party artwork in the repository.
use crate::{models, prepare_model_file};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;

#[test]
#[ignore = "Set DISCATELIER_SKP_CORPUS to the pinned OpenSKP corpus and DISCATELIER_SKP_OUTPUT to an empty test output directory"]
fn sketchup_public_corpus_preserves_original_and_renders_supported_versions() {
    let corpus =
        std::path::PathBuf::from(std::env::var_os("DISCATELIER_SKP_CORPUS").expect("corpus path"));
    let output =
        std::path::PathBuf::from(std::env::var_os("DISCATELIER_SKP_OUTPUT").expect("output path"));
    std::fs::create_dir_all(&output).unwrap();
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE model_assets(id TEXT PRIMARY KEY,title TEXT,byte_length INTEGER,data TEXT,preview TEXT);").unwrap();
    for version in ["2017", "2026"] {
        for name in [
            "box.skp",
            "face-with-hole.skp",
            "nested-component.skp",
            "component-rotate.skp",
            "instance-scaled.skp",
            "png-texture.skp",
            "texture-rotated.skp",
            "house-plus.skp",
        ] {
            let path = corpus.join(version).join(name);
            let prepared = prepare_model_file(&path)
                .unwrap_or_else(|e| panic!("{version}/{name}: {}", e.message));
            let value: Value = serde_json::from_str(&prepared.text).unwrap();
            assert_eq!(value["sourceFormat"], "skp");
            let files = value["files"].as_array().unwrap();
            assert_eq!(files.len(), 2);
            assert_eq!(
                STANDARD
                    .decode(files[0]["content"].as_str().unwrap())
                    .unwrap(),
                std::fs::read(&path).unwrap()
            );
            let glb = STANDARD
                .decode(files[1]["content"].as_str().unwrap())
                .unwrap();
            assert_eq!(&glb[..4], b"glTF");
            let size = u32::from_le_bytes(glb[12..16].try_into().unwrap()) as usize;
            let doc: Value = serde_json::from_slice(&glb[20..20 + size]).unwrap();
            assert!(!doc["meshes"].as_array().unwrap().is_empty());
            if name == "png-texture.skp" || name == "texture-rotated.skp" {
                assert!(!doc["images"].as_array().unwrap().is_empty());
            }
            let id = models::save(&db, &prepared.text).unwrap();
            assert_eq!(
                models::read(&db, &id, false).unwrap(),
                prepared.text.as_ref()
            );
            models::validate_stored(&db).unwrap();
            let target = output.join(format!("{version}-{name}.json"));
            std::fs::write(target, &*prepared.text).unwrap();
            println!(
                "{version}/{name}: {} meshes, {} nodes",
                doc["meshes"].as_array().unwrap().len(),
                doc["nodes"].as_array().unwrap().len()
            );
        }
    }
    for name in [
        "box-v2013.skp",
        "box-v2014.skp",
        "box-v2015.skp",
        "box-v2016.skp",
    ] {
        assert!(prepare_model_file(&corpus.join("legacy").join(name)).is_err());
    }
}

#[test]
fn invalid_sketchup_is_refused_before_storage() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("invalid.skp");
    std::fs::write(&path, b"not a model").unwrap();
    assert!(prepare_model_file(&path).is_err());
}
