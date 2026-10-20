#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod commands;
mod credentials;
mod data_location;
mod discogs;
mod model_picker;
mod model_stream;
mod models;
mod optical;
mod playback;
mod playback_backend;
mod playback_exit;
#[cfg(feature = "performance-harness")]
mod playback_fixture;
mod playback_settings;
mod updates;
mod video_input;
mod video_surface;
mod window_layout;

use discatelier_application::{LibraryService, PlaybackHistoryRepository};
use discatelier_storage::SqliteLibrary;
use std::sync::{Arc, Mutex};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol("prepared-model", models::protocol)
        .register_asynchronous_uri_scheme_protocol("collection-model", model_stream::protocol)
        .setup(|app| {
            let main = app.get_webview_window("main").ok_or("主窗口不可用")?;
            window_layout::fit(&main)?;
            app.manage(
                video_surface::VideoSurface::create(main.hwnd()?.0 as usize)
                    .map_err(|error| error.message)?,
            );
            let directory = app.path().app_local_data_dir()?;
            // Ordinary Release never redirects the user's collection via test env.
            #[cfg(any(debug_assertions, feature = "performance-harness"))]
            let directory = std::env::var_os("DISCATELIER_TEST_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(directory);
            let service = SqliteLibrary::open(&directory).and_then(|mut repository| {
                repository.interrupt_playback()?;
                Ok(LibraryService::new(repository))
            });
            let state: commands::LibraryState = Arc::new(Mutex::new(service));
            app.manage(state);
            let metadata: discogs::DiscogsState =
                Arc::new(Mutex::new(discogs::DiscogsService::new()));
            app.manage(metadata);
            app.manage(data_location::DataLocation(directory.clone()));
            app.manage(updates::UpdateState::default());
            app.manage(Arc::new(optical::OpticalService::new(directory)));
            app.manage(Arc::new(Mutex::new(None)) as playback::PlaybackState);
            app.manage(video_input::VideoInput::default());
            app.manage(playback_exit::PlaybackExit::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data_location::data_location,
            data_location::data_open_directory,
            updates::update_status,
            updates::update_save_token,
            updates::update_forget_token,
            updates::update_check,
            updates::update_download,
            updates::update_install,
            video_surface::playback_viewport,
            video_surface::playback_fullscreen,
            video_surface::playback_pointer,
            video_input::playback_native_keys,
            playback::playback_start,
            playback::playback_snapshot,
            playback::playback_control,
            playback::playback_history,
            optical::optical_list,
            optical::optical_probe,
            optical::playback_settings_get,
            optical::playback_settings_save,
            models::model_choose,
            models::model_release,
            commands::library_list,
            commands::library_create,
            commands::library_update,
            commands::library_backup,
            commands::library_update_edition,
            commands::library_cover,
            commands::library_model,
            commands::library_backups,
            commands::library_prepare_restore,
            commands::library_restore,
            discogs::discogs_configured,
            discogs::discogs_save_token,
            discogs::discogs_forget_token,
            discogs::discogs_search,
            discogs::discogs_release,
            discogs::discogs_open_release,
            discogs::imports::discogs_prepare_import,
            discogs::imports::discogs_import
        ])
        .build(tauri::generate_context!())
        .expect("DiscAtelier 无法启动")
        .run(|app, event| playback_exit::event(app, &event));
}
