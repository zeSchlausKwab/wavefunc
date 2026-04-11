//! Desktop-only native integrations: system tray, global media keys.
//!
//! Everything under this module is gated behind
//! `cfg(not(any(target_os = "android", target_os = "ios")))` in
//! [crate::lib]. Mobile targets never compile this code, which keeps
//! Android/iOS builds free of desktop-only dependencies.
//!
//! **Panic safety**: the setup functions called from here must never
//! panic into the caller. Tauri's setup callback runs from inside
//! tao's `did_finish_launching` observer, which is declared
//! `extern "C"` and thus cannot unwind. A panic in there crashes the
//! app with `panic_cannot_unwind` before the window is ever shown.
//! We catch panics defensively and log them; a missing tray or
//! unregistered media keys is a degraded experience, not a fatal one.

// media_keys is only used on non-macOS desktop. On macOS we skip
// global shortcut registration — see the setup() comment below.
#[cfg(not(target_os = "macos"))]
pub mod media_keys;
pub mod tray;

use std::panic::{catch_unwind, AssertUnwindSafe};

use tauri::App;

/// Called once from `lib::run()` during setup. Wires up the tray and
/// (on non-macOS) global media key shortcuts. Never returns an error
/// — every failure mode is caught and logged, because any error here
/// would propagate into tao's ObjC callback and abort the process.
pub fn setup(app: &mut App) {
    let handle = app.handle().clone();

    // Tray icon. On recent macOS releases, TrayIcon creation has
    // been reported to panic in some environments, so guard it.
    match catch_unwind(AssertUnwindSafe(|| tray::setup(&handle))) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            eprintln!("[wavefunc] tray setup error: {e}");
        }
        Err(panic) => {
            eprintln!("[wavefunc] tray setup PANICKED: {panic:?}");
        }
    }

    // Global media keys. Skipped on macOS entirely — macOS has its
    // own MediaRemote / MPRemoteCommandCenter system that the
    // global-shortcut plugin can't cleanly plug into, and attempting
    // to register media virtual-key codes through Carbon hotkeys is
    // known to panic on macOS 26. The WebView's MediaSession API
    // still handles the focused-window case via Now Playing.
    #[cfg(not(target_os = "macos"))]
    match catch_unwind(AssertUnwindSafe(|| media_keys::setup(&handle))) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            eprintln!("[wavefunc] media keys setup error: {e}");
        }
        Err(panic) => {
            eprintln!("[wavefunc] media keys setup PANICKED: {panic:?}");
        }
    }
}
