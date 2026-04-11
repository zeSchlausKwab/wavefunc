//! Desktop-only native integrations: system tray, global media keys.
//!
//! Everything under this module is gated behind
//! `cfg(not(any(target_os = "android", target_os = "ios")))` in
//! [crate::lib]. Mobile targets never compile this code, which keeps
//! Android/iOS builds free of desktop-only dependencies.

pub mod media_keys;
pub mod tray;

use tauri::App;

/// Called once from `lib::run()` during setup. Wires up the tray and
/// global shortcut handlers.
pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    tray::setup(app.handle())?;
    media_keys::setup(app.handle())?;
    Ok(())
}
