fn main() {
    let path = std::env::args_os()
        .nth(1)
        .expect("Provide an absolute libvlc.dll path");
    match discatelier_player_vlc::inspect_runtime(std::path::Path::new(&path)) {
        Ok(version) => println!(
            "libVLC {version}: ABI symbols and instance initialization passed; no media opened."
        ),
        Err(error) => {
            eprintln!("{}", error.message);
            std::process::exit(1);
        }
    }
}
