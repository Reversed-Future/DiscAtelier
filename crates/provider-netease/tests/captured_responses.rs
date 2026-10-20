//! Opt-in verification of locally captured public responses; performs no network calls.
#[test]
#[ignore = "Requires NETEASE_CAPTURE_DIRECTORY with the two captured public JSON responses"]
fn captured_public_responses_match_adapter() {
    let root = std::path::PathBuf::from(std::env::var_os("NETEASE_CAPTURE_DIRECTORY").unwrap());
    let album = discatelier_provider_netease::parse_album(
        serde_json::from_slice(&std::fs::read(root.join("netease-response-0.json")).unwrap())
            .unwrap(),
        32311,
    )
    .unwrap();
    let search = discatelier_provider_netease::parse_search(
        serde_json::from_slice(&std::fs::read(root.join("netease-response-1.json")).unwrap())
            .unwrap(),
    )
    .unwrap();
    assert!(!album.tracks.is_empty());
    assert!(!search.is_empty());
    println!(
        "Captured public responses: album {}, {} tracks; {} search results",
        album.album_id,
        album.tracks.len(),
        search.len()
    );
}
