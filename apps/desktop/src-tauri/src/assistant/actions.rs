use super::host::with_library;
use crate::commands::LibraryState;
use discatelier_agent_harness::ActionPreview;
use discatelier_contracts::*;
use discatelier_integration_http::error;
use serde::Serialize;
use std::time::{Duration, Instant};

pub enum Action {
    Create {
        request: Box<CreateCopy>,
        album: Option<MusicSupplement>,
    },
    Import(Box<ImportCopy>),
    Supplement {
        edition: String,
        revision: i64,
        album: MusicSupplement,
    },
    Cover(UpdateEdition),
}
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Images {
    pub before: Option<String>,
    pub after: Option<String>,
}
pub struct PreparedAction {
    pub preview: ActionPreview,
    pub images: Images,
    pub action: Action,
    pub created: Instant,
}
impl PreparedAction {
    pub fn check(&self, id: &str) -> Result<(), AppError> {
        if self.preview.id != id || self.created.elapsed() > Duration::from_secs(1800) {
            return Err(error("变更预览已过期，请取消后重新提出。"));
        }
        Ok(())
    }
    pub fn apply(&self, library: &LibraryState) -> Result<(), AppError> {
        with_library(library, |s| {
            match &self.action {
                Action::Create { request, album } => {
                    if let Some(album) = album {
                        s.create_music((**request).clone(), album.clone())?;
                    } else {
                        s.create((**request).clone())?;
                    }
                }
                Action::Import(value) => {
                    s.import_copy((**value).clone())?;
                }
                Action::Supplement {
                    edition,
                    revision,
                    album,
                } => {
                    s.save_supplement(edition, *revision, album)?;
                }
                Action::Cover(request) => {
                    s.update_edition(request.clone())?;
                }
            }
            Ok(())
        })
    }
}
