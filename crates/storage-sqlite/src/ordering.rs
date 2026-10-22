use crate::{db_error, SqliteLibrary};
use discatelier_application::ordering::CollectionOrderRepository;
use discatelier_contracts::{AppError, LibraryQuery};
use rusqlite::{OptionalExtension, TransactionBehavior};

impl CollectionOrderRepository for SqliteLibrary {
    fn move_copy(&mut self, copy_id: &str, before_id: Option<&str>) -> Result<(), AppError> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db_error)?;
        let category: Option<String> = tx.query_row("SELECT w.category_id FROM copies c JOIN editions e ON e.id=c.edition_id JOIN works w ON w.id=e.work_id WHERE c.id=?1",[copy_id],|r|r.get(0)).optional().map_err(db_error)?;
        let category =
            category.ok_or_else(|| AppError::new("not_found", "收藏已不存在，请刷新后重试。"))?;
        let mut ids: Vec<String> = crate::reads::list(
            &tx,
            &LibraryQuery {
                category_id: category,
                query: String::new(),
                status: None,
            },
        )?
        .into_iter()
        .map(|item| item.id)
        .collect();
        if before_id == Some(copy_id) {
            return Ok(());
        }
        ids.retain(|id| id != copy_id);
        let at = match before_id {
            Some(id) => ids
                .iter()
                .position(|x| x == id)
                .ok_or_else(|| AppError::new("conflict", "排序位置已变化，请刷新后重试。"))?,
            None => ids.len(),
        };
        ids.insert(at, copy_id.to_owned());
        for (position, id) in ids.iter().enumerate() {
            tx.execute("INSERT INTO collection_order(copy_id,position) VALUES(?1,?2) ON CONFLICT(copy_id) DO UPDATE SET position=excluded.position",rusqlite::params![id,position as i64]).map_err(db_error)?;
        }
        tx.commit().map_err(db_error)
    }
}
