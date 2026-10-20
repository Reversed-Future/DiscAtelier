/// Keep the initial outer window inside the current monitor's usable desktop.
pub fn fit(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()? else {
        return Ok(());
    };
    let work = monitor.work_area();
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    let border_width = outer.width.saturating_sub(inner.width);
    let border_height = outer.height.saturating_sub(inner.height);
    if outer.width > work.size.width || outer.height > work.size.height {
        window.set_size(tauri::PhysicalSize::new(
            inner
                .width
                .min(work.size.width.saturating_sub(border_width + 32)),
            inner
                .height
                .min(work.size.height.saturating_sub(border_height + 32)),
        ))?;
    }
    let fitted = window.outer_size()?;
    let position = window.outer_position()?;
    let bounded = tauri::PhysicalPosition::new(
        position.x.clamp(
            work.position.x,
            work.position.x + work.size.width.saturating_sub(fitted.width) as i32,
        ),
        position.y.clamp(
            work.position.y,
            work.position.y + work.size.height.saturating_sub(fitted.height) as i32,
        ),
    );
    if position != bounded {
        window.set_position(bounded)?;
    }
    Ok(())
}
