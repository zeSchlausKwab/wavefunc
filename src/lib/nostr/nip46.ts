import type { Platform } from "../platform";

const PLATFORM_LABELS: Record<Platform, string> = {
  web: "Web",
  android: "Android",
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  unknown: "App",
};

export function nip46ClientName(
  platform: Platform,
  production = process.env.NODE_ENV === "production",
): string {
  const appName = production ? "Wavefunc Radio" : "Wavefunc Radio DEV";
  return `${appName} · ${PLATFORM_LABELS[platform]}`;
}
