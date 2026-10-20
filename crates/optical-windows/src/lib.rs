mod audio_cd;
mod structure;
#[cfg(target_os = "windows")]
mod windows;
use discatelier_application::OpticalDeviceProvider;
use discatelier_contracts::{AppError, OpticalDrive};

pub struct WindowsOptical;
impl OpticalDeviceProvider for WindowsOptical {
    fn enumerate(&self) -> Result<Vec<OpticalDrive>, AppError> {
        #[cfg(target_os = "windows")]
        {
            windows::enumerate()
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(AppError::new("unsupported", "当前平台尚未接入光驱。"))
        }
    }
}
