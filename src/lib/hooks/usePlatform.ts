import { useEffect, useState } from "react";
import {
  detectPlatformInfo,
  initialPlatformInfo,
  type PlatformInfo,
} from "../platform";

export type { Platform, PlatformInfo } from "../platform";

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
  const [currentPlatform, setCurrentPlatform] = useState<PlatformInfo>(
    initialPlatformInfo,
  );

  useEffect(() => {
    let cancelled = false;
    detectPlatformInfo().then((info) => {
      if (!cancelled) setCurrentPlatform(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return currentPlatform;
}
