use discatelier_contracts::{AppError, PlaybackControl, PlaybackSnapshot};
use discatelier_player_mpv::MpvSession;
use discatelier_player_vlc::VlcSession;

/// Backend-specific lifetimes and controls stay outside the Tauri command layer.
pub enum PlaybackSession {
    Mpv(MpvSession),
    Dvd(VlcSession),
}
impl PlaybackSession {
    pub fn snapshot(&self) -> Result<PlaybackSnapshot, AppError> {
        match self {
            Self::Mpv(s) => s.snapshot(),
            Self::Dvd(s) => s.snapshot(),
        }
    }
    pub fn control(&self, id: &str, control: PlaybackControl) -> Result<(), AppError> {
        match self {
            Self::Mpv(s) => s.control(id, control),
            Self::Dvd(s) => s.control(id, control),
        }
    }
}
