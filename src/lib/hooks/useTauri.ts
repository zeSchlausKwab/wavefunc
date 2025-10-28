import { useEffect, useState } from "react";

/**
 * Hook to detect if the app is running in Tauri (desktop or mobile)
 *
 * @returns {boolean} true if running in Tauri, false otherwise
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isTauri = useTauri();
 *
 *   return (
 *     <div>
 *       {isTauri ? (
 *         <p>Running in Tauri app</p>
 *       ) : (
 *         <p>Running in web browser</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // Check if __TAURI__ is available on the window object
    setIsTauri(typeof window !== "undefined" && "__TAURI__" in window);
  }, []);

  return isTauri;
}
