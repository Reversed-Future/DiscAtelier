mod audio_cd;
pub mod dvd;
mod structure;
#[cfg(target_os = "windows")]
mod windows;
use discatelier_application::OpticalDeviceProvider;
use discatelier_contracts::{AppError, OpticalDrive};

pub fn eject(mount_point: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        windows::eject(mount_point)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = mount_point;
        Err(AppError::new("unsupported", "当前平台尚未接入光驱。"))
    }
}

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
