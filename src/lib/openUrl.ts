import { isTauri } from "../config/env";

/**
 * Open a URL using the platform's default handler.
 *
 * On Tauri (desktop/mobile), uses the shell plugin which correctly
 * fires Android intents for custom URL schemes (lightning:, bunker://, etc).
 * On web, falls back to window.open / window.location.href.
 */
export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch (err) {
      console.warn("openUrl: shell plugin failed, falling back to window", err);
    }
  }

  // Web fallback. For custom schemes (lightning:, bunker://, etc.)
  // window.open may not work, so we use location.href as last resort.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    window.location.href = url;
  }
}
