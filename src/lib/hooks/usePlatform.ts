import { useEffect, useState } from "react";
import { platform as getPlatform } from "@tauri-apps/plugin-os";

export type Platform = "linux" | "macos" | "ios" | "android" | "windows" | "web";

export interface PlatformInfo {
  platform: Platform;
  isTauri: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  isWeb: boolean;
  isAndroid: boolean;
  isIOS: boolean;
}

/**
 * Hook to detect the current platform and environment
 *
 * @returns {PlatformInfo} Platform information object
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isTauri, isMobile, isAndroid, platform } = usePlatform();
 *
 *   return (
 *     <div>
 *       {isTauri ? (
 *         <p>Running in Tauri on {platform}</p>
 *       ) : (
 *         <p>Running in web browser</p>
 *       )}
 *       {!isMobile && <DesktopOnlyFeature />}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePlatform(): PlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    platform: "web",
    isTauri: false,
    isMobile: false,
    isDesktop: false,
    isWeb: true,
    isAndroid: false,
    isIOS: false,
  });

  useEffect(() => {
    async function detectPlatform() {
      try {
        // Try to get platform from Tauri OS plugin
        const detectedPlatform = await getPlatform();

        const isMobile = detectedPlatform === "android" || detectedPlatform === "ios";
        const isDesktop = detectedPlatform === "linux" || detectedPlatform === "macos" || detectedPlatform === "windows";

        setPlatformInfo({
          platform: detectedPlatform as Platform,
          isTauri: true,
          isMobile,
          isDesktop,
          isWeb: false,
          isAndroid: detectedPlatform === "android",
          isIOS: detectedPlatform === "ios",
        });
      } catch (error) {
        // If Tauri API is not available, we're in a web browser
        setPlatformInfo({
          platform: "web",
          isTauri: false,
          isMobile: false,
          isDesktop: true, // Assume desktop web browser
          isWeb: true,
          isAndroid: false,
          isIOS: false,
        });
      }
    }

    detectPlatform();
  }, []);

  return platformInfo;
}
