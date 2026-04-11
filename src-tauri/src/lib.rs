use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop;

/// Wire payload from the JS bridge. Reflects the subset of player +
/// metadata state that's useful on the desktop side: the state
/// machine kind, the current station's identity, and the latest
/// now-playing metadata. See `src/lib/tauriBridge.ts` for the
/// producer side.
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub state: String,
    pub station_name: Option<String>,
    pub station_thumbnail: Option<String>,
    pub song: Option<String>,
    pub artist: Option<String>,
}

/// Exposed to JS as `invoke("update_now_playing", { np })`. On
/// desktop it forwards the update to the tray module. On mobile it's
/// a no-op — the JS bridge still calls it blindly, but the call is
/// cheap and simpler than gating on platform in JS.
#[tauri::command]
fn update_now_playing(
    app: tauri::AppHandle,
    np: NowPlaying,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        desktop::tray::update(&app, np).map_err(|e| e.to_string())?;
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // Shut up unused-warnings without a `let _ =` pair that
        // rustfmt would split across lines.
        drop(app);
        drop(np);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init());

    // Desktop-only plugins. Gated at compile time because
    // global-shortcut and autostart don't exist on mobile targets.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ));

    builder
        .invoke_handler(tauri::generate_handler![update_now_playing])
        .on_window_event(|window, event| {
            // Close-to-tray on desktop: intercept the close button
            // and hide the window instead, leaving the tray icon as
            // the way back. The Quit menu item in the tray is the
            // only true exit. Mobile has no close button so this
            // branch is dead code there — keep the cfg gate so the
            // logic is obvious.
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            // Silence unused-parameter warnings on mobile builds.
            #[cfg(any(target_os = "android", target_os = "ios"))]
            {
                drop(window);
                drop(event);
            }
        })
        .setup(|app| {
            // Dev tools on debug builds.
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Deep link open handler (all platforms). The plugin
            // registers the scheme; this forwards URL-open events
            // to the JS bridge, which parses and routes them.
            let handle_for_deep_link = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> =
                    event.urls().iter().map(|u| u.to_string()).collect();
                let _ = handle_for_deep_link.emit("deep-link-open", urls);
            });

            // --hidden flag handling. When the app is autolaunched
            // by the autostart plugin on login, it's launched with
            // `--hidden` and should start with the window hidden so
            // it doesn't pop up unwanted. Users can open it from
            // the tray.
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let args: Vec<String> = std::env::args().collect();
                if args.iter().any(|a| a == "--hidden") {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }

            // Desktop-specific native setup (tray + global shortcuts).
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            desktop::setup(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
