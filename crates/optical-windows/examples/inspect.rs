use discatelier_application::OpticalDeviceProvider;
fn main() {
    match discatelier_optical_windows::WindowsOptical.enumerate() {
        Ok(drives) => println!("{}", serde_json::to_string_pretty(&drives).unwrap()),
        Err(error) => eprintln!("{error:?}"),
    }
}
