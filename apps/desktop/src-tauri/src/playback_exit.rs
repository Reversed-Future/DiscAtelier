use std::sync::atomic::{AtomicU8, Ordering};
use tauri::Manager;

#[derive(Default)]
pub struct PlaybackExit(AtomicU8);
impl PlaybackExit {
    pub fn is_closing(&self) -> bool {
        self.0.load(Ordering::Acquire) != 0
    }
}

/// Keep the native parent alive and its message loop running while VLC releases
/// its video children. Joining a decoder from the window callback can deadlock.
pub fn event(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    if matches!(event, tauri::RunEvent::Exit) {
        crate::system_media::shutdown(app);
        app.state::<std::sync::Arc<discatelier_netease_runtime::Runtime>>()
            .shutdown();
        return;
    }
    let state = app.state::<PlaybackExit>();
    if state.0.load(Ordering::Acquire) == 2 {
        return;
    }
    match event {
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } if label == "main" => api.prevent_close(),
        tauri::RunEvent::ExitRequested { api, .. } => api.prevent_exit(),
        _ => return,
    }
    if state
        .0
        .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }
    crate::system_media::shutdown(app);
    let player = app
        .state::<crate::playback::PlaybackState>()
        .inner()
        .clone();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<std::sync::Arc<discatelier_netease_runtime::Runtime>>()
            .shutdown();
        crate::playback::shutdown(&player);
        app.state::<PlaybackExit>().0.store(2, Ordering::Release);
        app.exit(0);
    });
}
