use tauri::utils::config::{AppDirectoriesOverride, AppDirectoryOverrides};

/// WebView2 defaults to app_local_data_dir before setup creates our library.
/// Override that resolver before Builder::build. Tauri runtime 2.12.2 drops
/// WindowConfig.data_directory when constructing WebviewAttributes.
pub fn isolate_webviews(config: &mut tauri::Config) {
    config.app.app_directories_override =
        Some(AppDirectoriesOverride::Directories(AppDirectoryOverrides {
            local_data: Some("$LOCALDATA/com.reversedfuture.discatelier.video-preview".into()),
            ..Default::default()
        }));
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Manager,
    };

    #[test]
    fn preview_isolates_browser_storage_before_window_creation() {
        let mut config: tauri::Config =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let original_identifier = config.identifier.clone();
        let mut original = mock_context(noop_assets());
        *original.config_mut() = config.clone();
        let installed = mock_builder().build(original).unwrap();
        let installed_path = installed.path().app_local_data_dir().unwrap();
        isolate_webviews(&mut config);
        assert_eq!(config.identifier, original_identifier);
        let mut context = mock_context(noop_assets());
        *context.config_mut() = config;
        let preview = mock_builder().build(context).unwrap();
        let preview_path = preview.path().app_local_data_dir().unwrap();
        assert_eq!(
            preview_path,
            preview
                .path()
                .local_data_dir()
                .unwrap()
                .join("com.reversedfuture.discatelier.video-preview")
        );
        assert_ne!(preview_path, installed_path);
        assert_eq!(
            installed.path().app_local_data_dir().unwrap(),
            installed_path
        );
    }
}
