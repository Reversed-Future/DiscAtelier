use discatelier_contracts::{AppError, PlaybackControl, PlaybackSnapshot};
use discatelier_player_mpv::MpvSession;
use discatelier_player_vlc::VlcSession;

/// Backend-specific lifetimes and controls stay outside the Tauri command layer.
pub enum PlaybackSession {
    Mpv(MpvSession),
    Vlc(VlcSession),
}
impl PlaybackSession {
    pub fn snapshot(&self) -> Result<PlaybackSnapshot, AppError> {
        match self {
            Self::Mpv(s) => s.snapshot(),
            Self::Vlc(s) => s.snapshot(),
        }
    }
    pub fn control(&self, id: &str, control: PlaybackControl) -> Result<(), AppError> {
        match self {
            Self::Mpv(s) => s.control(id, control),
            Self::Vlc(s) => s.control(id, control),
        }
    }
}
