use discatelier_contracts::*;
pub mod ordering;
pub mod video;
use discatelier_domain::{carriers, categories, validate_copy, validate_edition};
use std::collections::BTreeMap;
mod song_links;
pub use song_links::SongLinkRepository;
mod disc_albums;
pub mod disc_links;
mod disc_structure;
mod extensions;
mod music_albums;
pub mod optical_discs;
mod physical_discs;
pub use extensions::ExtensionRepository;
mod metadata;
mod source_replacement;
pub use metadata::MetadataProvider;
mod optical;
pub use optical::{OpticalDeviceProvider, OpticalPlaybackProbe};
mod playback;
pub use playback::{PlaybackHistoryRepository, PlaybackProgress};

pub trait LibraryRepository: Send {
    fn edition_content(&self, edition_id: &str) -> Result<Option<EditionContent>, AppError>;
    fn complete_content(
        &mut self,
        edition_id: &str,
        source: &EditionSource,
        value: &EditionContent,
    ) -> Result<(), AppError>;
    fn save_edited_content(
        &mut self,
        edition_id: &str,
        value: &EditionContent,
    ) -> Result<(), AppError>;

    fn stage_model(&mut self, model: PreparedModel) -> Result<ModelPreparation, AppError>;
    fn prepared_model_data(&self, token: &str) -> Result<std::sync::Arc<str>, AppError>;
    fn release_model(&mut self, token: &str) -> Result<(), AppError>;
    fn source_copy(
        &self,
        provider_id: &str,
        external_id: &str,
    ) -> Result<Option<LibraryCopy>, AppError>;
    fn import_copy(&mut self, request: &ImportCopy) -> Result<String, AppError>;
    fn list(&self, query: &LibraryQuery) -> Result<Vec<LibraryCopy>, AppError>;
    fn create(&mut self, request: &CreateCopy) -> Result<String, AppError>;
    fn update(&mut self, request: &UpdateCopy) -> Result<String, AppError>;
    fn delete(&mut self, request: &DeleteCopy) -> Result<String, AppError>;
    fn replace_edition_source(&mut self, value: &ReplaceEditionSource) -> Result<String, AppError>;
    fn update_edition(&mut self, request: &UpdateEdition) -> Result<String, AppError>;
    fn update_edition_content(
        &mut self,
        request: &UpdateEdition,
        content: &EditionContent,
    ) -> Result<String, AppError>;
    fn model(&self, asset_id: &str, preview: bool) -> Result<String, AppError>;
    fn cover(&self, asset_id: &str) -> Result<String, AppError>;
    fn optical_binding(&self, media_token: &str) -> Result<Option<OpticalBinding>, AppError>;
    fn save_optical_binding(
        &mut self,
        media_token: &str,
        copy_id: &str,
        label: &str,
        disc_key: Option<&str>,
    ) -> Result<(), AppError>;
    fn remove_optical_binding(&mut self, media_token: &str) -> Result<(), AppError>;
    fn backup(&self) -> Result<String, AppError>;
    fn backups(&self) -> Result<Vec<BackupEntry>, AppError>;
    fn prepare_restore(&mut self, path: &str) -> Result<RestorePreview, AppError>;
    fn restore(&mut self, token: &str) -> Result<String, AppError>;
}
pub struct LibraryService<R: LibraryRepository> {
    repository: R,
}
impl<R: LibraryRepository> LibraryService<R> {
    pub fn edition_content(&self, edition_id: &str) -> Result<Option<EditionContent>, AppError> {
        request_id(edition_id)?;
        self.repository.edition_content(edition_id)
    }
    pub fn complete_content(
        &mut self,
        edition_id: &str,
        source: &EditionSource,
        value: &EditionContent,
    ) -> Result<(), AppError> {
        request_id(edition_id)?;
        validate_source(source, &[])?;
        validate_content(value)?;
        self.repository.complete_content(edition_id, source, value)
    }
    pub fn save_edited_content(
        &mut self,
        edition_id: &str,
        value: &EditionContent,
    ) -> Result<(), AppError> {
        request_id(edition_id)?;
        validate_content(value)?;
        self.repository.save_edited_content(edition_id, value)
    }

    pub fn stage_model(&mut self, model: PreparedModel) -> Result<ModelPreparation, AppError> {
        self.repository.stage_model(model)
    }
    pub fn prepared_model_data(&self, token: &str) -> Result<std::sync::Arc<str>, AppError> {
        request_id(token)?;
        self.repository.prepared_model_data(token)
    }
    pub fn release_model(&mut self, token: &str) -> Result<(), AppError> {
        request_id(token)?;
        self.repository.release_model(token)
    }
    pub fn source_copy(
        &self,
        provider_id: &str,
        external_id: &str,
    ) -> Result<Option<LibraryCopy>, AppError> {
        self.repository.source_copy(provider_id, external_id)
    }
    pub fn import_copy(&mut self, value: ImportCopy) -> Result<String, AppError> {
        request_id(&value.request.request_id)?;
        request_id(&value.request.token)?;
        validate_edition(&value.request.edition).map_err(validation)?;
        validate_copy(&value.request.copy).map_err(validation)?;
        validate_source(&value.source, &value.identifiers)?;
        validate_content(&value.content)?;
        match (&value.supplement, value.request.netease_album_id) {
            (Some(album), Some(id))
                if album.album_id == id && value.request.edition.category_id == "music" =>
            {
                validate_supplement(album)?;
            }
            (None, None) => (),
            _ => return Err(validation("网易云资料与入库选择不匹配。".into())),
        }
        match (
            &value.request.existing_edition_id,
            value.request.expected_revision,
        ) {
            (None, None) => (),
            (Some(id), Some(revision)) if revision > 0 => request_id(id)?,
            _ => return Err(validation("版本关联无效。".into())),
        }
        self.repository.import_copy(&value)
    }
    pub fn new(repository: R) -> Self {
        Self { repository }
    }
    pub fn list(&self, query: LibraryQuery) -> Result<LibrarySnapshot, AppError> {
        if !categories()
            .iter()
            .any(|entry| entry.id == query.category_id)
            || query
                .status
                .as_ref()
                .is_some_and(|status| !["owned", "wanted", "transit"].contains(&status.as_str()))
            || query.query.len() > 1000
        {
            return Err(AppError::new("validation", "搜索条件无效"));
        }
        let copies = self.repository.list(&query)?;
        let mut totals: BTreeMap<String, i128> = BTreeMap::new();
        let mut owned_count = 0;
        let mut unpriced_count = 0;
        let medium_count = copies.iter().map(|item| item.edition.media.len()).sum();
        for item in &copies {
            if item.copy.status == "owned" {
                owned_count += 1;
                if let Some(amount) = item.copy.amount_minor {
                    *totals.entry(item.copy.currency.clone()).or_default() += i128::from(amount);
                } else {
                    unpriced_count += 1;
                }
            }
        }
        Ok(LibrarySnapshot {
            copies,
            categories: categories(),
            carriers: carriers(),
            amounts: totals
                .into_iter()
                .map(|(key, value)| (key, value.to_string()))
                .collect(),
            owned_count,
            medium_count,
            unpriced_count,
        })
    }
    pub fn optical_binding(&self, media_token: &str) -> Result<Option<OpticalBinding>, AppError> {
        if media_token.is_empty() || media_token.len() > 256 {
            return Err(AppError::new("validation", "光盘标识无效。"));
        }
        self.repository.optical_binding(media_token)
    }
    pub fn save_optical_binding(
        &mut self,
        media_token: &str,
        copy_id: &str,
        label: &str,
    ) -> Result<(), AppError> {
        if media_token.is_empty() || media_token.len() > 256 || copy_id.is_empty() {
            return Err(AppError::new("validation", "光盘关联参数无效。"));
        }
        self.repository
            .save_optical_binding(media_token, copy_id, label, None)
    }
    pub fn save_optical_disc_binding(
        &mut self,
        media_token: &str,
        copy_id: &str,
        label: &str,
        disc_key: Option<&str>,
    ) -> Result<(), AppError> {
        self.repository
            .save_optical_binding(media_token, copy_id, label, disc_key)
    }
    pub fn remove_optical_binding(&mut self, media_token: &str) -> Result<(), AppError> {
        if media_token.is_empty() || media_token.len() > 256 {
            return Err(AppError::new("validation", "光盘标识无效。"));
        }
        self.repository.remove_optical_binding(media_token)
    }
    pub fn create(&mut self, request: CreateCopy) -> Result<String, AppError> {
        validate_create(&request)?;
        self.repository.create(&request)
    }
    pub fn update(&mut self, request: UpdateCopy) -> Result<String, AppError> {
        request_id(&request.request_id)?;
        request_id(&request.id)?;
        if request.expected_revision < 1 {
            return Err(validation("记录版本无效".into()));
        }
        validate_copy(&request.copy).map_err(validation)?;
        self.repository.update(&request)
    }
    pub fn delete(&mut self, request: DeleteCopy) -> Result<String, AppError> {
        request_id(&request.request_id)?;
        request_id(&request.id)?;
        if request.expected_revision < 1 {
            return Err(validation("记录版本无效".into()));
        }
        self.repository.delete(&request)
    }
    pub fn backup(&self) -> Result<String, AppError> {
        self.repository.backup()
    }
    pub fn backups(&self) -> Result<Vec<BackupEntry>, AppError> {
        self.repository.backups()
    }
    pub fn prepare_restore(&mut self, path: String) -> Result<RestorePreview, AppError> {
        if path.is_empty() || path.len() > 32768 {
            return Err(validation("请选择备份文件".into()));
        }
        self.repository.prepare_restore(&path)
    }
    pub fn restore(&mut self, token: String) -> Result<String, AppError> {
        request_id(&token)?;
        self.repository.restore(&token)
    }
    pub fn update_edition(&mut self, request: UpdateEdition) -> Result<String, AppError> {
        self.update_edition_with_content(request, None)
    }
    pub fn update_edition_with_content(
        &mut self,
        request: UpdateEdition,
        content: Option<EditionContent>,
    ) -> Result<String, AppError> {
        request_id(&request.request_id)?;
        request_id(&request.edition_id)?;
        if request.expected_revision < 1 {
            return Err(validation("版本记录无效".into()));
        }
        validate_edition(&request.edition).map_err(validation)?;
        if let Some(content) = content {
            validate_content(&content)?;
            self.repository.update_edition_content(&request, &content)
        } else {
            self.repository.update_edition(&request)
        }
    }
    pub fn model(&self, asset_id: String, preview: bool) -> Result<String, AppError> {
        if asset_id.len() != 64 || !asset_id.bytes().all(|value| value.is_ascii_hexdigit()) {
            return Err(validation("模型标识无效".into()));
        }
        self.repository.model(&asset_id, preview)
    }
    pub fn cover(&self, asset_id: String) -> Result<String, AppError> {
        if asset_id.len() != 64 || !asset_id.bytes().all(|value| value.is_ascii_hexdigit()) {
            return Err(validation("封面标识无效".into()));
        }
        self.repository.cover(&asset_id)
    }
}
fn validate_create(request: &CreateCopy) -> Result<(), AppError> {
    request_id(&request.request_id)?;
    match (&request.edition, &request.existing_edition_id) {
        (Some(edition), None) => validate_edition(edition).map_err(validation)?,
        (None, Some(id)) => request_id(id)?,
        _ => return Err(validation("必须指定一个新版本或已有版本".into())),
    }
    validate_copy(&request.copy).map_err(validation)
}
fn request_id(value: &str) -> Result<(), AppError> {
    uuid::Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| validation("请求标识无效".into()))
}
fn validation(message: String) -> AppError {
    AppError::new("validation", message)
}
