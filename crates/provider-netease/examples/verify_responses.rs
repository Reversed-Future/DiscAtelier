//! Explicit read-only check against captured api-enhanced public responses.
fn main() {
    let paths: Vec<_> = std::env::args().skip(1).collect();
    assert_eq!(paths.len(), 2, "Provide album JSON, then search JSON");
    let album = discatelier_provider_netease::parse_album(
        serde_json::from_slice(&std::fs::read(&paths[0]).unwrap()).unwrap(),
        32311,
    )
    .unwrap();
    let search = discatelier_provider_netease::parse_search(
        serde_json::from_slice(&std::fs::read(&paths[1]).unwrap()).unwrap(),
    )
    .unwrap();
    println!(
        "Verified actual api-enhanced responses: album {}, {} tracks; {} search results",
        album.album_id,
        album.tracks.len(),
        search.len()
    );
}
