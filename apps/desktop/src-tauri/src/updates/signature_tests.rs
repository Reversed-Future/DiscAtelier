use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri_plugin_updater::{Updater, UpdaterExt};

fn updater() -> Updater {
    // MockRuntime has no native window/event loop and never touches user data.
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
    let mut context = mock_context(noop_assets());
    context.config_mut().plugins = serde_json::from_value(config["plugins"].clone()).unwrap();
    let app = mock_builder()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .build(context)
        .unwrap();
    app.updater_builder()
        .target("windows-x86_64")
        .build()
        .unwrap()
}
fn manifest(version: &str) -> serde_json::Value {
    serde_json::json!({
        "version": version,
        "platforms": { "windows-x86_64": {
            "url": "https://api.github.com/repos/Reversed-Future/DiscAtelier/releases/assets/123",
            "signature": include_str!("fixtures/payload.signature").trim()
        } }
    })
}
#[test]
fn signed_payload_passes_but_corruption_and_wrong_version_fail() {
    let updater = updater();
    let update = updater.restore_update(manifest("0.1.4")).unwrap().unwrap();
    assert!(update
        .verify(include_bytes!("fixtures/payload.txt"))
        .is_ok());
    assert!(update.verify(b"changed payload").is_err());
    let mislabeled = updater.restore_update(manifest("0.1.5")).unwrap().unwrap();
    assert!(mislabeled
        .verify(include_bytes!("fixtures/payload.txt"))
        .is_err());
}
#[test]
fn equal_or_older_versions_do_not_produce_an_installable_update() {
    let updater = updater(); // mock app version is 0.1.0
    assert!(updater.restore_update(manifest("0.1.0")).unwrap().is_none());
    assert!(updater.restore_update(manifest("0.0.9")).unwrap().is_none());
}
#[test]
fn unsigned_payload_cannot_be_verified() {
    let mut unsigned = manifest("0.1.4");
    unsigned["platforms"]["windows-x86_64"]["signature"] = "".into();
    let update = updater().restore_update(unsigned).unwrap().unwrap();
    assert!(update
        .verify(include_bytes!("fixtures/payload.txt"))
        .is_err());
}

#[test]
#[ignore = "Explicit release verification: public GitHub read, no installation or user-data access"]
fn verify_published_release() {
    let token = std::env::var("GITHUB_TOKEN")
        .ok()
        .or_else(|| std::env::var("GH_TOKEN").ok());
    let token = token.as_deref();
    tauri::async_runtime::block_on(async {
        let client = super::github::client().unwrap();
        let release: super::github::Release = serde_json::from_slice(
            &super::github::read(
                &client,
                super::github::LATEST,
                token,
                2 * 1024 * 1024,
                |_, _| {},
            )
            .await
            .unwrap(),
        )
        .unwrap();
        assert_eq!(release.tag_name, format!("v{}", env!("CARGO_PKG_VERSION")));
        let asset = super::github::asset(&release, "latest.json", 256 * 1024).unwrap();
        let manifest = serde_json::from_slice(
            &super::github::read(&client, &asset.url, token, asset.size, |_, _| {})
                .await
                .unwrap(),
        )
        .unwrap();
        let expected_size = super::github::validate_manifest(&release, &manifest).unwrap();
        let update = updater().restore_update(manifest).unwrap().unwrap();
        let bytes = super::github::read(
            &client,
            update.download_url.as_str(),
            token,
            expected_size,
            |_, _| {},
        )
        .await
        .unwrap();
        assert_eq!(bytes.len() as u64, expected_size);
        update.verify(&bytes).unwrap();
        let mut damaged = bytes.clone();
        damaged[0] ^= 1;
        assert!(update.verify(&damaged).is_err());
        println!("Verified public release {}: {} bytes; damaged package rejected; installer not executed", release.tag_name, bytes.len());
    });
}

#[test]
#[ignore = "Explicit local release verification: reads installer bytes, never executes them"]
fn verify_local_release_package() {
    let path = std::env::var("DISCATELIER_VERIFY_PACKAGE").expect("Set the exact installer path");
    let bytes = std::fs::read(&path).unwrap();
    let mut update = updater()
        .restore_update(manifest(env!("CARGO_PKG_VERSION")))
        .unwrap()
        .unwrap();
    update.signature = std::fs::read_to_string(format!("{path}.sig"))
        .unwrap()
        .trim()
        .to_owned();
    update.verify(&bytes).unwrap();
    println!(
        "Local package signature and signed version verified: {} bytes",
        bytes.len()
    );
}
