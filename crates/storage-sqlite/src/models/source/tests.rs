use super::*;
use std::fs;

#[test]
fn obj_snapshot_keeps_original_bytes_and_exact_nested_resources() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("materials/textures")).unwrap();
    let obj = "mtllib materials/surface.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
    fs::write(dir.path().join("test.obj"), obj).unwrap();
    fs::write(
        dir.path().join("materials/surface.mtl"),
        "newmtl paint\nmap_Kd -s 1 1 1 textures/with spaces.png\n",
    )
    .unwrap();
    fs::write(
        dir.path().join("materials/textures/with spaces.png"),
        b"original texture bytes",
    )
    .unwrap();
    let prepared = prepare(&dir.path().join("test.obj"), "obj").unwrap();
    let source: Source = serde_json::from_str(&prepared.text).unwrap();
    assert_eq!(source.files.len(), 3);
    assert_eq!(
        STANDARD.decode(&source.files[0].content).unwrap(),
        obj.as_bytes()
    );
    let changed = with_preview(&prepared.text, EMPTY_PREVIEW).unwrap();
    assert_eq!(changed.id, prepared.id);
    let mut value: serde_json::Value = serde_json::from_str(&prepared.text).unwrap();
    value["files"].as_array_mut().unwrap().pop();
    assert!(validation::validate(&value.to_string()).is_err());
    fs::write(dir.path().join("test.obj"), "mtllib missing.mtl\n").unwrap();
    assert!(prepare(&dir.path().join("test.obj"), "obj").is_err());
    // The immutable preparation survives source edits and still validates.
    assert!(validation::validate(&prepared.text).is_ok());
}
#[test]
fn dependencies_never_escape_the_selected_directory() {
    for name in [
        "../outside",
        "C:\\secret",
        "https://host/a",
        "/root",
        "a/../../file",
    ] {
        assert!(resources::relative(name).is_err());
    }
    assert_eq!(
        resources::relative("./textures\\color.png").unwrap(),
        "textures/color.png"
    );
}
#[test]
fn fbx_video_paths_and_embedded_content_are_distinguished() {
    let source = b"FBXHeaderExtension: {\n\tFBXVersion: 7400\n}\nObjects: {\n\tVideo: 1, \"Video::one\", \"Clip\" {\n\t\tRelativeFilename: \"textures\\color.png\"\n\t}\n\tVideo: 2, \"Video::two\", \"Clip\" {\n\t\tFilename: \"elsewhere.png\"\n\t\tContent: ,\n\t\t\"AAAAAA==\"\n\t}\n}\n";
    assert_eq!(
        fbx::references(source).unwrap(),
        vec!["textures\\color.png"]
    );
    assert!(fbx::references(b"not fbx").is_err());
    assert!(fbx::references(b"Kaydara FBX Binary  \0\x1a\0").is_err());
}
#[test]
fn original_source_obeys_total_byte_limit_and_cover_validation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("large.obj");
    fs::File::create(&path)
        .unwrap()
        .set_len((RAW_LIMIT + 1) as u64)
        .unwrap();
    assert!(prepare(&path, "obj").is_err());
    fs::write(&path, "v 0 0 0").unwrap();
    let model = prepare(&path, "obj").unwrap();
    assert!(with_preview(&model.text, "https://host/image.png").is_err());
}
