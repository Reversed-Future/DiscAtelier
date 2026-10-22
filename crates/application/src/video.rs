use crate::{LibraryRepository, LibraryService};
use discatelier_contracts::*;

pub trait VideoRepository {
    fn video_metadata(&self, edition: &str) -> Result<Option<VideoMetadata>, AppError>;
    fn create_video(
        &mut self,
        request: &CreateCopy,
        metadata: &VideoMetadata,
    ) -> Result<String, AppError>;
    fn update_video(
        &mut self,
        request: &UpdateEdition,
        metadata: &VideoMetadata,
    ) -> Result<String, AppError>;
}
impl<R: LibraryRepository + VideoRepository> LibraryService<R> {
    pub fn video_metadata(&self, edition: &str) -> Result<Option<VideoMetadata>, AppError> {
        crate::request_id(edition)?;
        self.repository.video_metadata(edition)
    }
    pub fn create_video(
        &mut self,
        request: CreateCopy,
        metadata: VideoMetadata,
    ) -> Result<String, AppError> {
        crate::validate_create(&request)?;
        validate_video(&metadata)?;
        if request
            .edition
            .as_ref()
            .is_none_or(|e| e.category_id != "video")
            || request.existing_edition_id.is_some()
        {
            return Err(AppError::new(
                "validation",
                "影像资料只能用于新增影像版本。",
            ));
        }
        self.repository.create_video(&request, &metadata)
    }
    pub fn update_video(
        &mut self,
        request: UpdateEdition,
        metadata: VideoMetadata,
    ) -> Result<String, AppError> {
        crate::request_id(&request.request_id)?;
        crate::request_id(&request.edition_id)?;
        discatelier_domain::validate_edition(&request.edition).map_err(crate::validation)?;
        validate_video(&metadata)?;
        if request.expected_revision < 1 || request.edition.category_id != "video" {
            return Err(AppError::new("validation", "影像版本无效。"));
        }
        self.repository.update_video(&request, &metadata)
    }
}
