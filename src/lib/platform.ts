import { isTauri as tauriIsTauri } from "@tauri-apps/api/core";

export type Platform =
  | "linux"
  | "macos"
  | "ios"
  | "android"
  | "windows"
  | "web"
  | "unknown";

export interface PlatformInfo {
  platform: Platform;
  isTauri: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isWeb: boolean;
  isAndroid: boolean;
  isIOS: boolean;
}

const NATIVE_PLATFORMS = new Set<Platform>([
  "linux",
  "macos",
  "ios",
  "android",
  "windows",
]);

/**
 * Synchronously distinguish an installed Tauri app from the website.
 *
 * The official API is authoritative. The host/global checks cover the short
 * startup window before the bridge is fully initialized and older generated
 * mobile shells. A native app is never reclassified as web just because an OS
 * plugin call fails.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (tauriIsTauri()) return true;
  } catch {
    // Continue through the compatibility checks below.
  }

  const runtime = window as typeof window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return Boolean(
    runtime.__TAURI__ ||
      runtime.__TAURI_INTERNALS__ ||
      runtime.location.hostname === "tauri.localhost" ||
      runtime.location.protocol === "tauri:",
  );
}

function inferNativePlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("macintosh") || ua.includes("mac os")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function platformInfo(
  platform: Platform,
  native = platform !== "web",
): PlatformInfo {
  return {
    platform,
    isTauri: native,
    isMobile: platform === "android" || platform === "ios",
    isDesktop: NATIVE_PLATFORMS.has(platform) && platform !== "android" && platform !== "ios",
    isWeb: !native,
    isAndroid: platform === "android",
    isIOS: platform === "ios",
  };
}

/** Detect the runtime platform without confusing a browser OS with an app. */
export async function detectPlatform(): Promise<Platform> {
  if (!isNativeApp()) return "web";

  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    const detected = platform() as Platform;
    if (NATIVE_PLATFORMS.has(detected)) return detected;
  } catch (error) {
    console.warn("platform: native OS detection failed", error);
  }

  return inferNativePlatform(globalThis.navigator?.userAgent ?? "");
}

export function initialPlatformInfo(): PlatformInfo {
  if (!isNativeApp()) return platformInfo("web", false);
  return platformInfo(inferNativePlatform(globalThis.navigator?.userAgent ?? ""), true);
}

export async function detectPlatformInfo(): Promise<PlatformInfo> {
  const platform = await detectPlatform();
  return platformInfo(platform, platform !== "web");
}
