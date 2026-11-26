//! Input bridge for the native disc-menu surface. This does not synthesize input.
//! Eight playback keys are sampled while this app is foreground and the menu
//! surface is visible and enabled. Focus can legitimately sit on the webview
//! controls or VLC's video child, so it is not part of the gate.
use std::sync::Mutex;
use tauri::Manager;
use windows_sys::Win32::UI::{
    Input::KeyboardAndMouse::{
        GetAsyncKeyState, IsWindowEnabled, VK_CONTROL, VK_DOWN, VK_ESCAPE, VK_F, VK_LEFT, VK_MENU,
        VK_RETURN, VK_RIGHT, VK_SHIFT, VK_SPACE, VK_UP,
    },
    WindowsAndMessaging::{GetForegroundWindow, IsWindowVisible},
};

#[derive(Default)]
pub struct VideoInput(Mutex<u16>);

#[tauri::command]
pub fn playback_native_keys(window: tauri::WebviewWindow) -> Vec<String> {
    let surface = window.state::<crate::video_surface::VideoSurface>();
    let input = window.state::<VideoInput>();
    let Ok(mut previous) = input.0.lock() else {
        return Vec::new();
    };
    let mut keys = Vec::new();
    unsafe {
        if GetForegroundWindow() != surface.owner as _
            || IsWindowVisible(surface.host as _) == 0
            || IsWindowEnabled(surface.host as _) == 0
        {
            *previous = 0;
            return keys;
        }
        let modified = [VK_CONTROL, VK_MENU, VK_SHIFT]
            .iter()
            .any(|key| GetAsyncKeyState(*key as i32) < 0);
        let mut down = 0;
        for (index, (key, name)) in [
            (VK_ESCAPE, "Escape"),
            (VK_SPACE, " "),
            (VK_RETURN, "Enter"),
            (VK_UP, "ArrowUp"),
            (VK_DOWN, "ArrowDown"),
            (VK_LEFT, "ArrowLeft"),
            (VK_RIGHT, "ArrowRight"),
            (VK_F, "f"),
        ]
        .iter()
        .enumerate()
        {
            if GetAsyncKeyState(*key as i32) < 0 {
                down |= 1 << index;
                if !modified && *previous & (1 << index) == 0 {
                    keys.push((*name).into());
                }
            }
        }
        *previous = down;
    }
    keys
}
