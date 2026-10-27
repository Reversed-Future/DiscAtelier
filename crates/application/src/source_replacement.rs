use crate::{LibraryRepository, LibraryService};
use discatelier_contracts::*;

impl<R: LibraryRepository> LibraryService<R> {
    pub fn replace_edition_source(
        &mut self,
        value: ReplaceEditionSource,
    ) -> Result<String, AppError> {
        crate::request_id(&value.request.request_id)?;
        crate::request_id(&value.request.edition_id)?;
        discatelier_domain::validate_edition(&value.request.edition).map_err(crate::validation)?;
        validate_content(&value.content)?;
        validate_source(&value.source, &value.identifiers)?;
        if value.request.expected_revision < 1 || value.source.provider_id != "discogs" {
            return Err(AppError::new("validation", "Discogs 版本资料无效。"));
        }
        if let Some(metadata) = &value.video {
            validate_video(metadata)?;
            if value.request.edition.category_id != "video" {
                return Err(AppError::new("validation", "影像资料与收藏分区不一致。"));
            }
        }
        self.repository.replace_edition_source(&value)
    }
}
