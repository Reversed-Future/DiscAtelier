use crate::LibraryRepository;
use crate::LibraryService;
use discatelier_contracts::{validate_supplement, AppError, CreateCopy, MusicSupplement};

pub trait ExtensionRepository {
    fn create_music(
        &mut self,
        request: &CreateCopy,
        album: &MusicSupplement,
    ) -> Result<String, AppError>;
    fn supplement(&self, edition: &str) -> Result<Option<MusicSupplement>, AppError>;
    fn save_supplement(
        &mut self,
        edition: &str,
        revision: i64,
        value: &MusicSupplement,
    ) -> Result<(), AppError>;
    fn assistant_load(&self) -> Result<Option<String>, AppError>;
    fn assistant_save(&mut self, id: &str, payload: &str) -> Result<(), AppError>;
}
impl<R: LibraryRepository + ExtensionRepository> LibraryService<R> {
    pub fn create_music(
        &mut self,
        request: CreateCopy,
        album: MusicSupplement,
    ) -> Result<String, AppError> {
        crate::validate_create(&request)?;
        if request.existing_edition_id.is_some()
            || request
                .edition
                .as_ref()
                .is_none_or(|edition| edition.category_id != "music")
        {
            return Err(AppError::new(
                "validation",
                "网易云资料只能用于新增音乐版本。",
            ));
        }
        validate_supplement(&album)?;
        self.repository.create_music(&request, &album)
    }
    pub fn supplement(&self, edition: &str) -> Result<Option<MusicSupplement>, AppError> {
        crate::request_id(edition)?;
        self.repository.supplement(edition)
    }
    pub fn save_supplement(
        &mut self,
        edition: &str,
        revision: i64,
        value: &MusicSupplement,
    ) -> Result<(), AppError> {
        crate::request_id(edition)?;
        validate_supplement(value)?;
        if revision < 1 {
            return Err(AppError::new("validation", "版本无效。"));
        }
        self.repository.save_supplement(edition, revision, value)
    }
    pub fn assistant_load(&self) -> Result<Option<String>, AppError> {
        self.repository.assistant_load()
    }
    pub fn assistant_save(&mut self, id: &str, payload: &str) -> Result<(), AppError> {
        crate::request_id(id)?;
        if payload.len() > 1024 * 1024
            || serde_json::from_str::<serde_json::Value>(payload).is_err()
        {
            return Err(AppError::new("assistant", "会话超过保存限制，请新建会话。"));
        }
        self.repository.assistant_save(id, payload)
    }
}
