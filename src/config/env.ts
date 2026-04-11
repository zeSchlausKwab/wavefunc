/**
 * Environment configuration for WaveFunc
 *
 * This file handles environment-specific settings like relay URLs
 * which differ between desktop, Android, and iOS platforms.
 */

/**
 * Detect if running in Tauri (desktop or mobile)
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  // v1/v2: __TAURI_INTERNAL__ ist ein guter Indikator, __TAURI__ optional je nach Config
  return !!w.__TAURI__ || !!w.__TAURI_INTERNAL__;
}
// Bun's bundler inlines process.env.VAR at build time, but only with dot notation
// and a literal string key — never with bracket notation or a variable key.
// These constants are replaced with their values (or undefined) when bundled.

/**
 * Detect platform when running in Tauri
 */
async function getPlatform(): Promise<string | null> {
  if (!isTauri()) return null;

  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    return platform();
  } catch {
    return null;
  }
}

/**
 * Get the appropriate relay URL based on platform
 *
 * - Production web: Uses current host with /relay path
 * - Development: Uses localhost:3334
 * - Android emulator: Uses 10.0.2.2 to reach host machine
 * - iOS/Desktop: Uses localhost
 */
async function getRelayUrl(): Promise<string> {
  // Check for environment variable first (inlined at build time by Bun's bundler)
  const envRelayUrl = process.env.RELAY_URL;
  if (envRelayUrl) {
    return envRelayUrl;
  }

  // If running in browser (not Tauri), construct from current location
  if (typeof window !== "undefined" && !isTauri()) {
    // Determine WebSocket protocol based on page protocol
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;

    // In development (localhost:3000), connect directly to relay on :3334
    if (host.includes("localhost") || host.includes("127.0.0.172")) {
      return `${protocol}//${host}:3334`;
    }

    // If accessing via IP address, don't try to construct subdomain
    // This happens during initial deployment before DNS is fully working
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      console.warn("⚠️ Accessing via IP address - using fallback relay URL");
      return `${protocol}//${host}/relay/`;
    }

    // In production with domain, use relay subdomain (e.g., relay.wavefunc.live)
    return `${protocol}//relay.${host}`;
  }

  const platformName = await getPlatform();

  // Android: the WebView host depends on whether this is a dev or prod build.
  // - Dev + adb reverse (our tauri:android script): hostname is 127.0.0.1 → use it
  // - Dev on emulator without adb reverse: hostname is 10.0.2.2 → use it
  // - Dev on a LAN IP (TAURI_DEV_HOST unset): hostname is 192.168.x.y → use it
  // - Production APK: hostname is `tauri.localhost` (Tauri's bundled-asset URL)
  //   which doesn't route anywhere — fall back to the public relay.
  if (platformName === "android") {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const isDevHost =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "10.0.2.2" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    if (isDevHost) {
      return `ws://${hostname}:3334`;
    }
    return "wss://relay.wavefunc.live";
  }

  // iOS: same story — prod builds need a public relay, dev uses local.
  if (platformName === "ios") {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const isDevHost =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
    if (isDevHost) {
      return `ws://${hostname}:3334`;
    }
    return "wss://relay.wavefunc.live";
  }

  // Desktop fallback
  return "ws://localhost:3334";
}

/**
 * Environment configuration object
 * Initialize this at app startup
 */
export const config = {
  relayUrl: process.env.RELAY_URL || "ws://localhost:3334",
  metadataServerPubkey:
    process.env.METADATA_SERVER_PUBKEY ||
    "86a82cab18b293f53cbaaae8cdcbee3f7ec427fdf9f9c933db77800bb5ef38a0",
  metadataClientKey:
    process.env.METADATA_CLIENT_KEY ||
    "5c81bffa8303bbd7726d6a5a1170f3ee46de2addabefd6a735845166af01f5c0",
};

/**
 * Initialize environment configuration
 * Call this early in your app initialization
 */
export async function initConfig(): Promise<void> {
  config.relayUrl = await getRelayUrl();
  console.log("📡 Relay URL configured:", config.relayUrl);
}
