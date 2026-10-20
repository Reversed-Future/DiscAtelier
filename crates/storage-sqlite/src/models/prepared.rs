use discatelier_contracts::{AppError, ModelPreparation, PreparedModel};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

const MAX_AGE: Duration = Duration::from_secs(30 * 60);
const MAX_ITEMS: usize = 2;
#[derive(Default)]
pub struct PreparedModels {
    entries: HashMap<String, (Instant, PreparedModel)>,
}
impl PreparedModels {
    pub fn insert(&mut self, model: PreparedModel) -> ModelPreparation {
        self.entries
            .retain(|_, (created, _)| created.elapsed() < MAX_AGE);
        if self.entries.len() >= MAX_ITEMS {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, (created, _))| *created)
                .map(|(token, _)| token.clone());
            if let Some(token) = oldest {
                self.entries.remove(&token);
            }
        }
        let token = uuid::Uuid::new_v4().to_string();
        let result = ModelPreparation {
            token: token.clone(),
            title: model.title.clone(),
            byte_length: model.text.len(),
        };
        self.entries.insert(token, (Instant::now(), model));
        result
    }
    pub fn get(&self, token: &str) -> Result<&PreparedModel, AppError> {
        self.entries
            .get(token)
            .filter(|(created, _)| created.elapsed() < MAX_AGE)
            .map(|(_, model)| model)
            .ok_or_else(|| AppError::new("expired", "模型预览已过期，请重新选择文件。"))
    }
    pub fn release(&mut self, token: &str) {
        self.entries.remove(token);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn model() -> PreparedModel {
        PreparedModel {
            id: "id".into(),
            title: "title".into(),
            text: "{}".into(),
            preview: "".into(),
        }
    }
    #[test]
    fn expired_and_released_preparations_are_inaccessible_and_capacity_is_bounded() {
        let mut pool = PreparedModels::default();
        let first = pool.insert(model());
        pool.entries.get_mut(&first.token).unwrap().0 = Instant::now() - MAX_AGE;
        assert!(pool.get(&first.token).is_err());
        let second = pool.insert(model());
        assert_eq!(pool.entries.len(), 1);
        pool.release(&second.token);
        assert!(pool.get(&second.token).is_err());
        for _ in 0..4 {
            pool.insert(model());
        }
        assert_eq!(pool.entries.len(), MAX_ITEMS);
    }
}
