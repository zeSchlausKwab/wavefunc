//! System tray icon with live "now playing" state.
//!
//! The tray menu is built once at startup and mutated in-place as the
//! JS side pushes fresh state via the `update_now_playing` Tauri
//! command. Menu item handles are kept in `TrayState`, which is
//! stored in managed app state so the command handler can reach them.
//!
//! Menu shape:
//!   🎙 <station name>         (disabled, informational)
//!   ♪ <song — artist>          (disabled, hidden when no metadata)
//!   ─────────
//!   Play / Pause / Connecting… / Retry   (toggles based on state)
//!   Stop                                  (enabled when a station is loaded)
//!   ─────────
//!   Show / Hide Window
//!   ─────────
//!   Quit WaveFunc
//!
//! Clicks on the tray icon itself toggle main window visibility.
//! Clicking a menu action emits a `media-control` event that the JS
//! bridge listens for and dispatches to the player store.

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::NowPlaying;

/// Managed state holding handles to the mutable menu items so the
/// `update_now_playing` command can update labels/enabled state.
pub struct TrayState {
    pub station_item: MenuItem<Wry>,
    pub track_item: MenuItem<Wry>,
    pub play_pause_item: MenuItem<Wry>,
    pub stop_item: MenuItem<Wry>,
    pub show_hide_item: MenuItem<Wry>,
    pub tray: TrayIcon<Wry>,
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    // Disabled items are informational; they display text but cannot
    // be clicked. We still need an ID in case we want to tweak them
    // later, and Tauri 2 requires one anyway.
    let station_item = MenuItem::with_id(app, "np_station", "No station", false, None::<&str>)?;
    let track_item = MenuItem::with_id(app, "np_track", "", false, None::<&str>)?;
    let play_pause_item =
        MenuItem::with_id(app, "play_pause", "Play", false, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "Stop", false, None::<&str>)?;
    let show_hide_item =
        MenuItem::with_id(app, "show_hide", "Hide Window", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit WaveFunc", true, None::<&str>)?;

    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &station_item,
            &track_item,
            &sep1,
            &play_pause_item,
            &stop_item,
            &sep2,
            &show_hide_item,
            &sep3,
            &quit_item,
        ],
    )?;

    // Use the app's default window icon for the tray. Tauri 2 has
    // this wired up from the `icon` array in tauri.conf.json.
    // Template-mode icons for macOS are a nice-to-have we'll skip
    // for now — the full-color icon is acceptable as a first cut.
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default_window_icon".into()))?;

    let tray = TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("WaveFunc Radio")
        .menu(&menu)
        // Left click should not open the menu — we use it for
        // show/hide. Right click (or long-press on Linux tray
        // impls) opens the menu per platform convention.
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_icon_event)
        .build(app)?;

    app.manage(TrayState {
        station_item,
        track_item,
        play_pause_item,
        stop_item,
        show_hide_item,
        tray,
    });

    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "play_pause" => {
            let _ = app.emit("media-control", "toggle");
        }
        "stop" => {
            let _ = app.emit("media-control", "stop");
        }
        "show_hide" => {
            toggle_main_window(app);
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

fn handle_tray_icon_event(tray: &TrayIcon<Wry>, event: TrayIconEvent) {
    // Only react to a completed left click — mouse-down alone would
    // flicker on drag, and right-click opens the menu via Tauri's
    // default handling.
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        toggle_main_window(tray.app_handle());
    }
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
            // Refresh the menu label so the tray matches reality.
            if let Some(state) = app.try_state::<TrayState>() {
                let _ = state.show_hide_item.set_text("Show Window");
            }
        }
        _ => {
            let _ = window.show();
            let _ = window.set_focus();
            if let Some(state) = app.try_state::<TrayState>() {
                let _ = state.show_hide_item.set_text("Hide Window");
            }
        }
    }
}

/// Called from the Tauri command handler each time the player store
/// changes. Rebuilds all tray labels from the snapshot and updates
/// the tooltip.
pub fn update(app: &AppHandle, np: NowPlaying) -> tauri::Result<()> {
    let Some(state) = app.try_state::<TrayState>() else {
        // Tray not ready yet — the command may fire before setup
        // completes on a very fast launch. Safe to drop; the next
        // state change will push again.
        return Ok(());
    };

    // ─── Station line ─────────────────────────────────────────────
    let station_label = np
        .station_name
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("No station");
    state
        .station_item
        .set_text(format!("🎙 {station_label}"))?;

    // ─── Track line ────────────────────────────────────────────────
    let track_label = match (np.song.as_deref(), np.artist.as_deref()) {
        (Some(song), Some(artist)) if !song.is_empty() && !artist.is_empty() => {
            format!("♪ {song} — {artist}")
        }
        (Some(song), _) if !song.is_empty() => format!("♪ {song}"),
        _ => String::new(),
    };
    // We can't dynamically hide a menu item, but an empty string
    // renders as a thin gap which is acceptable. If it proves ugly
    // we can rebuild the menu — but that's more expensive than text
    // updates and we'd need to juggle item lifetimes.
    state.track_item.set_text(&track_label)?;

    // ─── Play/Pause toggle state ───────────────────────────────────
    let (pp_label, pp_enabled) = match np.state.as_str() {
        "idle" => ("Play", false),
        "loading" => ("Connecting…", false),
        "reconnecting" => ("Reconnecting…", false),
        "buffering" => ("Buffering…", true),
        "playing" => ("Pause", true),
        "paused" => ("Play", true),
        "failed" => ("Retry", true),
        _ => ("Play", false),
    };
    state.play_pause_item.set_text(pp_label)?;
    state.play_pause_item.set_enabled(pp_enabled)?;

    // ─── Stop button ───────────────────────────────────────────────
    let stop_enabled = np.state != "idle";
    state.stop_item.set_enabled(stop_enabled)?;

    // ─── Tooltip ───────────────────────────────────────────────────
    let tooltip = if track_label.is_empty() {
        format!("WaveFunc — {station_label}")
    } else {
        // Strip the leading symbols for the tooltip — they look busy
        // in a system-rendered OS tooltip.
        let song_and_artist = track_label.trim_start_matches('♪').trim();
        format!("{station_label}\n{song_and_artist}")
    };
    state.tray.set_tooltip(Some(tooltip))?;

    Ok(())
}
