use crate::{LibraryRepository, LibraryService};
use discatelier_contracts::AppError;

pub trait CollectionOrderRepository {
    fn move_copy(&mut self, copy_id: &str, before_id: Option<&str>) -> Result<(), AppError>;
}
impl<R: LibraryRepository + CollectionOrderRepository> LibraryService<R> {
    pub fn move_copy(&mut self, copy_id: &str, before_id: Option<&str>) -> Result<(), AppError> {
        crate::request_id(copy_id)?;
        if let Some(id) = before_id {
            crate::request_id(id)?;
        }
        self.repository.move_copy(copy_id, before_id)
    }
}
