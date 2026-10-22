#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod assistant;
mod backups;
mod bluray;
mod cd_metadata;
mod commands;
mod credentials;
mod data_location;
mod discogs;
mod exchange;
mod integration_settings;
mod mobile_bridge;
mod model_picker;
mod model_stream;
mod models;
mod netease;
mod netease_albums;
mod netease_artwork;
mod netease_auth;
mod netease_create;
mod netease_links;
mod netease_playback;
mod netease_queue;
mod optical;
mod playback;
mod playback_backend;
mod playback_exit;
#[cfg(feature = "performance-harness")]
mod playback_fixture;
mod playback_settings;
mod purchase_recognition;
mod updates;
mod video_input;
mod video_metadata;
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
            // Feature-only test build: never migrate the installed application's library.
            #[cfg(feature = "isolated-preview")]
            let directory =
                directory.with_file_name("com.reversedfuture.discatelier.video-preview");
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
            app.manage(mobile_bridge::Bridge::default());
            app.manage(updates::UpdateState::default());
            app.manage(Arc::new(exchange::ExchangeState::default()));
            app.manage(Arc::new(assistant::AgentState::default()));
            app.manage(Arc::new(netease::NeteaseState::default()));
            app.manage(Arc::new(netease_queue::QueueState::default()));
            app.manage(Arc::new(netease_links::SongState::default()));
            app.manage(Arc::new(netease_auth::Auth::default()));
            let runtime_root = app.path().resource_dir()?.join("netease-runtime");
            #[cfg(debug_assertions)]
            let runtime_root = if runtime_root.is_dir() {
                runtime_root
            } else {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../../../artifacts/netease-runtime")
            };
            app.manage(Arc::new(discatelier_netease_runtime::Runtime::new(
                runtime_root,
                directory.join("netease-cache"),
            )));
            app.manage(Arc::new(optical::OpticalService::new(directory)));
            app.manage(Arc::new(Mutex::new(None)) as playback::PlaybackState);
            app.manage(video_input::VideoInput::default());
            app.manage(playback_exit::PlaybackExit::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mobile_bridge::mobile_addresses,
            mobile_bridge::mobile_start,
            mobile_bridge::mobile_poll,
            mobile_bridge::mobile_stop,
            purchase_recognition::purchase_recognize,
            video_metadata::video_open_source,
            video_metadata::video_open_bangumi_token,
            video_metadata::links::video_open_reference,
            video_metadata::artwork::video_cover,
            video_metadata::video_search,
            video_metadata::video_work,
            video_metadata::video_chapters,
            video_metadata::video_images,
            video_metadata::video_metadata,
            video_metadata::video_create,
            video_metadata::video_update,
            video_metadata::recognition::video_recognize,
            video_metadata::settings::video_settings_get,
            video_metadata::settings::video_settings_save,
            exchange::exchange_status,
            exchange::exchange_open_docs,
            exchange::exchange_save,
            exchange::exchange_refresh,
            integration_settings::integration_settings_get,
            integration_settings::integration_settings_save,
            netease::netease_search,
            netease_auth::netease_account_status,
            netease_auth::netease_login_begin,
            netease_auth::netease_login_poll,
            netease_auth::netease_login_cancel,
            netease_auth::netease_account_logout,
            netease::netease_album,
            netease_artwork::netease_album_cover,
            netease::netease_song_album,
            netease::netease_saved,
            netease_albums::netease_albums,
            netease_queue::netease_queue_context,
            netease_queue::netease_queue_remember,
            netease_albums::netease_disc_albums,
            netease_albums::netease_bind_disc,
            netease_albums::netease_reorder_albums,
            netease_albums::netease_remove_album,
            netease::netease_apply,
            netease_create::netease_create_copy,
            netease_playback::netease_play,
            netease_links::netease_link_track,
            netease_links::netease_track_links,
            netease_links::netease_song_detail,
            assistant::assistant_snapshot,
            assistant::assistant_send,
            assistant::assistant_retry,
            assistant::assistant_cancel,
            assistant::assistant_new,
            assistant::assistant_decide,
            assistant::assistant_preview_images,
            data_location::data_location,
            backups::backup_inventory,
            backups::backup_delete_one,
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
            cd_metadata::optical_cd_metadata,
            optical::optical_probe,
            optical::playback_settings_get,
            optical::playback_settings_save,
            bluray::bluray_key_status,
            bluray::bluray_key_import,
            bluray::bluray_key_download,
            models::model_choose,
            models::model_release,
            commands::library_list,
            commands::library_move,
            commands::library_content,
            discogs::imports::discogs_complete_content,
            commands::library_create,
            commands::library_update,
            commands::library_delete,
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
            discogs::discogs_open_token_page,
            discogs::imports::discogs_prepare_import,
            discogs::imports::discogs_import
        ])
        .build(tauri::generate_context!())
        .expect("DiscAtelier 无法启动")
        .run(|app, event| playback_exit::event(app, &event));
}
