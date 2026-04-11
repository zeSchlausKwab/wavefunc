/**
 * Desktop-only settings: autostart on login.
 *
 * Hidden entirely on the web build (the settings tab is conditional
 * on `isTauri()`). Inside Tauri, queries the autostart plugin for
 * the current state and toggles it on click. The plugin itself is
 * only loaded on desktop (see `Cargo.toml` target-specific deps),
 * so on Android/iOS the dynamic import catches and shows an
 * explanatory disabled state.
 */

import { useEffect, useState } from "react";

import { isTauri } from "@/config/env";

type AutostartState = "loading" | "enabled" | "disabled" | "unavailable";

export function DesktopSettings() {
  const [state, setState] = useState<AutostartState>("loading");
  const [busy, setBusy] = useState(false);

  // Query current state on mount. The plugin may not be available
  // on mobile Tauri builds (we don't load it there), in which case
  // the dynamic import throws and we fall back to "unavailable".
  useEffect(() => {
    if (!isTauri()) {
      setState("unavailable");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        const enabled = await isEnabled();
        if (!cancelled) setState(enabled ? "enabled" : "disabled");
      } catch (err) {
        console.warn("DesktopSettings: autostart unavailable", err);
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    if (busy || state === "loading" || state === "unavailable") return;
    setBusy(true);
    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (state === "enabled") {
        await disable();
        setState("disabled");
      } else {
        await enable();
        setState("enabled");
      }
    } catch (err) {
      console.error("DesktopSettings: toggle failed", err);
    } finally {
      setBusy(false);
    }
  };

  const enabled = state === "enabled";
  const unavailable = state === "unavailable" || state === "loading";

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-2 pb-3 border-b-4 border-on-background">
        <span className="material-symbols-outlined text-[20px]">desktop_windows</span>
        <h3 className="text-base font-black uppercase tracking-tighter">
          Desktop Integration
        </h3>
      </div>

      <p className="text-sm text-on-background/60">
        Settings for the native desktop app. Features here only affect
        the Tauri build — the web app is unchanged.
      </p>

      {/* Autostart toggle */}
      <div className="border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">
        <button
          type="button"
          onClick={handleToggle}
          disabled={unavailable || busy}
          className="w-full flex items-center gap-4 p-4 text-left hover:bg-surface-container-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className={`material-symbols-outlined text-[24px] ${
              enabled ? "text-primary" : "text-on-background/40"
            }`}
            style={enabled ? { fontVariationSettings: "'FILL' 1" } : {}}
          >
            power_settings_new
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm uppercase tracking-tighter font-headline leading-tight">
              LAUNCH_ON_LOGIN
            </p>
            <p className="text-[11px] text-on-background/60 leading-tight mt-1">
              {state === "loading"
                ? "Checking…"
                : state === "unavailable"
                ? "Autostart is not available on this platform."
                : enabled
                ? "WaveFunc starts hidden when you log in. Click the tray icon to open."
                : "WaveFunc will not start automatically."}
            </p>
          </div>
          <div
            className={`w-12 h-6 border-2 border-on-background relative transition-colors shrink-0 ${
              enabled ? "bg-primary" : "bg-surface"
            }`}
            aria-hidden
          >
            <div
              className={`absolute top-0 bottom-0 w-5 bg-on-background transition-all ${
                enabled ? "left-[calc(100%-20px)]" : "left-0"
              }`}
            />
          </div>
        </button>
      </div>

      {/* Info blurb about system tray + media keys */}
      <div className="border-l-4 border-primary pl-4 py-2">
        <p className="text-[11px] font-black uppercase tracking-widest text-primary leading-none">
          DESKTOP_FEATURES
        </p>
        <ul className="mt-2 space-y-1 text-[12px] text-on-background/70">
          <li>System tray with now-playing info and play/pause/stop controls.</li>
          <li>Global media keys (Play/Pause, Stop) work even when WaveFunc is unfocused.</li>
          <li>
            Closing the window hides to the tray. Use the tray menu's
            <em> Quit WaveFunc</em> to fully exit.
          </li>
          <li>
            Open <code>wavefunc://station/&lt;naddr&gt;</code> links from other
            apps to jump straight to a station.
          </li>
        </ul>
      </div>
    </div>
  );
}
