use super::error;
use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub font_size: u8,
    pub background_opacity: u8,
    pub vertical_position: u8,
}
impl Default for Appearance {
    fn default() -> Self {
        Self {
            font_size: 22,
            background_opacity: 65,
            vertical_position: 100,
        }
    }
}
impl Appearance {
    pub fn validate(&self) -> Result<(), AppError> {
        if !(14..=48).contains(&self.font_size)
            || self.background_opacity > 100
            || self.vertical_position > 100
        {
            return Err(error(
                "字幕字号应在 14–48 之间，背景不透明度和垂直位置应在 0–100 之间。",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::subtitles::models::Preferences;

    #[test]
    fn earlier_settings_keep_their_recognition_preferences() {
        let p: Preferences =
            serde_json::from_str(r#"{"model":"small","language":"en","bilingual":false}"#).unwrap();
        assert_eq!(p.model, "small");
        assert_eq!(p.appearance.font_size, 22);
        assert_eq!(p.appearance.vertical_position, 100);
    }
}
