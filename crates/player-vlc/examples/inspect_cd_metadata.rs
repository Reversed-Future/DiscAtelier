//! Read CD metadata without producing audio or opening any window.
fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(
        args.len(),
        3,
        "usage: inspect_cd_metadata <libvlc.dll> <drive:>"
    );
    let source = discatelier_contracts::PlaybackSource {
        mount_point: args[2].clone(),
        media_token: String::new(),
        playlist: "cd-track:1".into(),
        label: String::new(),
    };
    match discatelier_player_vlc::read_cd_metadata(std::path::Path::new(&args[1]), &source) {
        Ok(tracks) => println!("{}", serde_json::to_string_pretty(&tracks).unwrap()),
        Err(error) => {
            eprintln!("{}", error.message);
            std::process::exit(1);
        }
    }
}
