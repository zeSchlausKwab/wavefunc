import { isNativeApp } from "./platform";

const ALLOWED_SCHEMES = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "lightning",
  "nostrconnect",
  "bunker",
]);

export function toLightningUri(invoice: string): string {
  const value = invoice.trim();
  return value.toLowerCase().startsWith("lightning:")
    ? value
    : `lightning:${value}`;
}

function validateExternalUri(uri: string): string {
  const value = uri.trim();
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (!scheme || !ALLOWED_SCHEMES.has(scheme)) {
    throw new Error(`Unsupported external URI scheme: ${scheme ?? "none"}`);
  }
  return value;
}

/**
 * Open a URL using the platform's default handler.
 *
 * Installed apps use Tauri's native opener. On Android this dispatches an
 * ACTION_VIEW intent for custom schemes such as lightning: and nostrconnect:.
 * The website retains ordinary browser behavior. Native failures never fall
 * through to WebView navigation.
 */
export async function openUrl(uri: string): Promise<void> {
  const url = validateExternalUri(uri);

  if (isNativeApp()) {
    const { openUrl: openNativeUrl } = await import("@tauri-apps/plugin-opener");
    await openNativeUrl(url);
    return;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    window.location.assign(url);
  }
}
