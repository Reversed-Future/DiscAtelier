use discatelier_contracts::{AppError, OpticalDrive, PlaybackDiagnostic};

/// Device adapters only inspect. They cannot write collection data or media.
pub trait OpticalDeviceProvider: Send + Sync {
    fn enumerate(&self) -> Result<Vec<OpticalDrive>, AppError>;
}

/// Opening a disc is distinct from validating video decode, region or menus.
pub trait OpticalPlaybackProbe: Send + Sync {
    fn probe(&self, mount_point: &str, playlist: &str) -> Result<PlaybackDiagnostic, AppError>;
}
