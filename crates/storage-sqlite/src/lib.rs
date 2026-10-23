mod artwork;
pub mod backup_management;
mod content;
mod create_music;
mod deletes;
mod disc_albums;
mod editions;
mod extensions;
mod imports;
mod migrations;
mod models;
mod music_albums;
mod optical;
mod ordering;
mod song_links;
mod video;
pub use models::file::prepare as prepare_model_file;
mod playback;
pub mod profiling;
mod reads;
mod recovery;
mod search;
mod update_backup;
mod writes;
pub use update_backup::backup_for_update;

use discatelier_application::LibraryRepository;
use discatelier_contracts::*;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub struct SqliteLibrary {
    connection: Connection,
    directory: PathBuf,
    prepared_restore: Option<recovery::PreparedRestore>,
    prepared_models: models::prepared::PreparedModels,
}
impl SqliteLibrary {
    pub fn open(directory: &Path) -> Result<Self, AppError> {
        std::fs::create_dir_all(directory).map_err(io_error)?;
        let mut connection =
            Connection::open(directory.join("library.sqlite3")).map_err(db_error)?;
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(db_error)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(db_error)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(db_error)?;
        migrations::apply(&mut connection, directory)?;
        Ok(Self {
            connection,
            directory: directory.into(),
            prepared_restore: None,
            prepared_models: Default::default(),
        })
    }
}
impl LibraryRepository for SqliteLibrary {
    fn edition_content(&self, edition_id: &str) -> Result<Option<EditionContent>, AppError> {
        content::read(&self.connection, edition_id)
    }
    fn complete_content(
        &mut self,
        edition_id: &str,
        source: &EditionSource,
        value: &EditionContent,
    ) -> Result<(), AppError> {
        content::complete(&self.connection, edition_id, source, value)
    }

    fn stage_model(&mut self, model: PreparedModel) -> Result<ModelPreparation, AppError> {
        Ok(self.prepared_models.insert(model))
    }
    fn prepared_model_data(&self, token: &str) -> Result<std::sync::Arc<str>, AppError> {
        Ok(self.prepared_models.get(token)?.text.clone())
    }
    fn release_model(&mut self, token: &str) -> Result<(), AppError> {
        self.prepared_models.release(token);
        Ok(())
    }
    fn source_copy(
        &self,
        provider_id: &str,
        external_id: &str,
    ) -> Result<Option<LibraryCopy>, AppError> {
        imports::source_copy(&self.connection, provider_id, external_id)
    }
    fn import_copy(&mut self, request: &ImportCopy) -> Result<String, AppError> {
        imports::create(&mut self.connection, request, &self.prepared_models)
    }
    fn list(&self, query: &LibraryQuery) -> Result<Vec<LibraryCopy>, AppError> {
        reads::list(&self.connection, query)
    }
    fn create(&mut self, request: &CreateCopy) -> Result<String, AppError> {
        writes::create(&mut self.connection, request, &self.prepared_models)
    }
    fn update(&mut self, request: &UpdateCopy) -> Result<String, AppError> {
        writes::update(&mut self.connection, request)
    }
    fn delete(&mut self, request: &DeleteCopy) -> Result<String, AppError> {
        deletes::delete(&mut self.connection, request)
    }
    fn update_edition(&mut self, request: &UpdateEdition) -> Result<String, AppError> {
        editions::update(&mut self.connection, request, &self.prepared_models)
    }
    fn model(&self, asset_id: &str, preview: bool) -> Result<String, AppError> {
        models::read(&self.connection, asset_id, preview)
    }
    fn cover(&self, asset_id: &str) -> Result<String, AppError> {
        artwork::read(&self.connection, asset_id)
    }
    fn optical_binding(&self, media_token: &str) -> Result<Option<OpticalBinding>, AppError> {
        optical::binding(&self.connection, media_token)
    }
    fn save_optical_binding(
        &mut self,
        media_token: &str,
        copy_id: &str,
        label: &str,
    ) -> Result<(), AppError> {
        optical::save(&self.connection, media_token, copy_id, label)
    }
    fn remove_optical_binding(&mut self, media_token: &str) -> Result<(), AppError> {
        optical::remove(&self.connection, media_token)
    }
    fn backup(&self) -> Result<String, AppError> {
        let directory = self.directory.join("backups");
        std::fs::create_dir_all(&directory).map_err(io_error)?;
        let path = directory.join(format!(
            "library-{}-{}.sqlite3",
            chrono::Utc::now().format("%Y%m%d-%H%M%S"),
            uuid::Uuid::new_v4()
        ));
        self.connection
            .backup(rusqlite::MAIN_DB, &path, None)
            .map_err(db_error)?;
        Ok(path.to_string_lossy().into_owned())
    }
    fn backups(&self) -> Result<Vec<BackupEntry>, AppError> {
        recovery::backups(&self.directory)
    }
    fn prepare_restore(&mut self, path: &str) -> Result<RestorePreview, AppError> {
        self.prepared_restore = None;
        let (prepared, preview) = recovery::prepare(&self.connection, &self.directory, path)?;
        self.prepared_restore = Some(prepared);
        Ok(preview)
    }
    fn restore(&mut self, token: &str) -> Result<String, AppError> {
        let prepared = self
            .prepared_restore
            .take()
            .ok_or_else(|| AppError::new("restore", "请重新检查备份文件。"))?;
        prepared.check(&self.connection, token)?;
        let saved = self.backup()?;
        recovery::copy(&prepared.connection, &mut self.connection)?;
        self.connection.flush_prepared_statement_cache();
        Ok(saved)
    }
}
fn db_error(error: rusqlite::Error) -> AppError {
    eprintln!("SQLite: {error}");
    AppError::new(
        "storage",
        "数据库操作失败，数据未提交。请检查磁盘空间和文件权限。",
    )
}
fn io_error(error: std::io::Error) -> AppError {
    eprintln!("Storage: {error}");
    AppError::new(
        "storage",
        "无法访问收藏数据目录，请检查磁盘空间和文件权限。",
    )
}
