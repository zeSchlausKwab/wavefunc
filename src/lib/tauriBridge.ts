/**
 * Tauri ↔ JS bridge. Wires up the Phase 2 native integrations:
 *
 * 1. Pushes the player + metadata state to Rust so the system tray
 *    can display now-playing information in its menu and tooltip.
 *    Subscribes to both stores; pushes on every meaningful change.
 * 2. Listens for `media-control` events from Rust (global shortcuts,
 *    tray menu clicks) and dispatches them to the player store.
 * 3. Listens for `deep-link-open` events (wavefunc://... URLs) and
 *    routes them through TanStack Router.
 *
 * The entire module is a no-op when running in a plain browser:
 * `isTauri()` gates everything, and all `@tauri-apps/*` imports are
 * dynamic so they never get bundled into the web build.
 */

import type { Router } from "@tanstack/react-router";

import { isTauri } from "../config/env";
import { useMetadataStore } from "../stores/metadataStore";
import { usePlayerStore } from "../stores/playerStore";

// Payload shape matches Rust's `NowPlaying` struct (camelCase on the
// wire, snake_case in Rust — see `src-tauri/src/lib.rs` for the
// counterpart, which uses `#[serde(rename_all = "camelCase")]`).
interface NowPlayingPayload {
  state: string;
  stationName: string | null;
  stationThumbnail: string | null;
  song: string | null;
  artist: string | null;
}

type MediaControlAction =
  | "toggle"
  | "play"
  | "pause"
  | "stop"
  | "next"
  | "previous";

/**
 * Install the bridge. Safe to call from anywhere — returns a cleanup
 * function (may be a no-op). Call it once on app mount with the
 * router instance so deep links can navigate.
 */
export async function installTauriBridge(
  router: Router<never, never>
): Promise<() => void> {
  if (!isTauri()) return () => {};

  // Dynamic imports. Bun's bundler sees these as dynamic chunks and
  // doesn't resolve @tauri-apps/* for web builds that never call
  // installTauriBridge() past the isTauri() gate.
  const [{ invoke }, { listen }, deepLink] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
    import("@tauri-apps/plugin-deep-link").catch(() => null),
  ]);

  const pushNowPlaying = () => {
    const player = usePlayerStore.getState();
    const metadata = useMetadataStore.getState().currentMetadata;

    const payload: NowPlayingPayload = {
      state: player.state.kind,
      stationName: player.currentStation?.name ?? null,
      stationThumbnail: player.currentStation?.thumbnail ?? null,
      song: metadata?.song ?? null,
      artist: metadata?.artist ?? null,
    };

    invoke("update_now_playing", { np: payload }).catch((err) => {
      console.warn("tauriBridge: update_now_playing failed", err);
    });
  };

  // ─── Store subscriptions ────────────────────────────────────────
  //
  // Push on any change that affects the tray rendering:
  // - state.kind transitions (idle → playing etc)
  // - station identity changes
  // - metadata changes (song/artist)
  //
  // Reference equality on `state` is enough for the player store
  // because we create a fresh object on every transition in the
  // state module.
  const unsubPlayer = usePlayerStore.subscribe((store, prev) => {
    if (
      store.state.kind !== prev.state.kind ||
      store.currentStation !== prev.currentStation
    ) {
      pushNowPlaying();
    }
  });

  const unsubMeta = useMetadataStore.subscribe((store, prev) => {
    if (store.currentMetadata !== prev.currentMetadata) {
      pushNowPlaying();
    }
  });

  // Initial sync — ensures the tray shows the correct state even
  // before any transition happens (e.g., after app launch with a
  // restored last station).
  pushNowPlaying();

  // ─── Route deep links ───────────────────────────────────────────
  //
  // Shared helper used both by the event listener (for URLs that
  // arrive while the app is running) and by the initial cold-start
  // check below (for URLs that launched the app).
  const routeDeepLinks = (urls: string[]) => {
    for (const urlStr of urls) {
      try {
        const url = new URL(urlStr);
        if (url.protocol !== "wavefunc:") continue;
        // wavefunc://station/<naddr>
        if (url.host === "station") {
          const naddr = url.pathname.replace(/^\//, "");
          if (naddr) {
            void router.navigate({
              to: "/station/$naddr",
              params: { naddr },
            });
          }
        }
      } catch (err) {
        console.warn("tauriBridge: bad deep link url", urlStr, err);
      }
    }
  };

  // ─── Media control events from Rust ─────────────────────────────
  const unlistenMedia = await listen<MediaControlAction>(
    "media-control",
    (event) => {
      const store = usePlayerStore.getState();
      const kind = store.state.kind;

      switch (event.payload) {
        case "toggle":
          // Context-sensitive toggle. Mirror the semantics of the
          // lockscreen play/pause button and the tray menu toggle.
          if (kind === "playing" || kind === "buffering") {
            store.pause();
          } else if (kind === "paused") {
            store.resume();
          } else if (kind === "failed") {
            store.retry();
          }
          // idle / loading / reconnecting: nothing sensible to do
          break;
        case "play":
          if (kind === "paused") store.resume();
          else if (kind === "failed") store.retry();
          break;
        case "pause":
          if (kind === "playing" || kind === "buffering") store.pause();
          break;
        case "stop":
          store.stop();
          break;
        case "next":
        case "previous":
          // Radio has no track concept; reserved for future
          // "next/prev favorite station" wiring.
          break;
      }
    }
  );

  // ─── Deep link events ───────────────────────────────────────────
  const unlistenDeepLink = await listen<string[]>("deep-link-open", (event) => {
    routeDeepLinks(event.payload ?? []);
  });

  // Cold start: the app may have been launched FROM a deep link,
  // in which case the plugin's on_open_url fired before the JS
  // listener was attached. getCurrent() returns the URLs that
  // launched us, if any.
  if (deepLink) {
    try {
      const current = await deepLink.getCurrent();
      if (current && current.length > 0) {
        routeDeepLinks(current);
      }
    } catch (err) {
      console.warn("tauriBridge: getCurrent() failed", err);
    }
  }

  return () => {
    unsubPlayer();
    unsubMeta();
    unlistenMedia();
    unlistenDeepLink();
  };
}
