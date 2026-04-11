//! Global media-key shortcuts. Registers OS-level shortcuts for the
//! standard media keys (Play/Pause, Stop, Next, Previous) so keyboard
//! media buttons work even when the WaveFunc window is not focused.
//!
//! When the window IS focused, we deliberately skip emitting — the
//! in-WebView MediaSession API will already handle the key and we'd
//! otherwise double-dispatch. See [is_main_focused] below.
//!
//! Radio doesn't have a meaningful "next/previous track" concept, so
//! Next/Previous are ignored by the JS bridge for now. They could be
//! wired to "next/prev favorite station" later — registering them
//! here costs nothing and reserves the shortcut from other apps.

use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Shortcut, ShortcutState,
};

pub fn setup(app: &AppHandle) -> Result<(), tauri_plugin_global_shortcut::Error> {
    let manager = app.global_shortcut();

    // `on_shortcut` both registers and installs a per-shortcut
    // handler. Each media key gets its own closure so dispatch is a
    // compile-time match rather than a runtime compare.
    manager.on_shortcut(
        Shortcut::new(None, Code::MediaPlayPause),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed && !is_main_focused(app) {
                let _ = app.emit("media-control", "toggle");
            }
        },
    )?;

    manager.on_shortcut(
        Shortcut::new(None, Code::MediaStop),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed && !is_main_focused(app) {
                let _ = app.emit("media-control", "stop");
            }
        },
    )?;

    // We register next/previous even though radio has no track
    // concept, so the shortcut is reserved for our app. The JS side
    // ignores them.
    manager.on_shortcut(
        Shortcut::new(None, Code::MediaTrackNext),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed && !is_main_focused(app) {
                let _ = app.emit("media-control", "next");
            }
        },
    )?;

    manager.on_shortcut(
        Shortcut::new(None, Code::MediaTrackPrevious),
        |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed && !is_main_focused(app) {
                let _ = app.emit("media-control", "previous");
            }
        },
    )?;

    Ok(())
}

/// Returns true if the main WaveFunc window is currently focused.
/// Used to avoid double-dispatching media keys: when focused, the
/// WebView's own MediaSession handlers fire, and adding a global
/// shortcut dispatch on top would produce two play/pause actions for
/// one key press.
fn is_main_focused(app: &AppHandle<Wry>) -> bool {
    app.webview_windows()
        .values()
        .any(|w| w.is_focused().unwrap_or(false))
}
