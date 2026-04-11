/**
 * Screen Wake Lock API binding.
 *
 * Holds a screen wake lock while `shouldHold` is true AND the document
 * is visible. Automatically releases on blur (when the tab is hidden)
 * and re-acquires when the tab becomes visible again — the browser
 * revokes locks on hide, so we can't just hold one across visibility
 * transitions.
 *
 * Why this matters for a radio app: on Android the screen dims and
 * locks after ~30s of idle, which is fine for most apps but frustrating
 * if the user is actively looking at the now-playing info, artwork, or
 * diagnostics panel. Wake Lock keeps the screen on *only while the
 * user is actually looking at the app* — when they switch away it
 * releases, so we don't burn battery uselessly.
 *
 * NOT a replacement for a foreground service (TAURI_IMPROVEMENTS 3.1).
 * Wake Lock only works while the tab is visible — it does nothing for
 * background audio. For background playback survival we'll still need
 * the native service.
 *
 * Safe in browsers without support (older Firefox, iOS < 16.4 Safari):
 * the feature detection falls through to a no-op.
 */

import { useEffect, useRef } from "react";

// TypeScript's DOM lib is slow to ship Wake Lock types. Hand-roll a
// minimal interface rather than pulling in a whole @types package.
interface WakeLockSentinel extends EventTarget {
  released: boolean;
  type: "screen";
  release(): Promise<void>;
}

interface WakeLockNavigator {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinel>;
  };
}

export function useWakeLock(shouldHold: boolean): void {
  // Keep the sentinel in a ref so the release effect can see the
  // latest instance across re-renders without retriggering.
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  // Use a ref for the most recent `shouldHold` value so the
  // visibilitychange listener (which closes over the initial value)
  // can check the current state without being re-attached.
  const shouldHoldRef = useRef(shouldHold);
  shouldHoldRef.current = shouldHold;

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return; // unsupported browser — no-op

    let cancelled = false;

    const acquire = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await wakeLock.request("screen");
        if (cancelled) {
          // Released between request and resolve — drop it.
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        // The browser may release the lock on its own (tab hide,
        // permission change, etc). Clear our ref when that happens
        // so the next acquire attempt actually requests a new one.
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
        });
      } catch (err) {
        // Common failures:
        // - NotAllowedError: document not visible (race with
        //   visibilitychange) — retried on next visibility change.
        // - SecurityError: not in a secure context. Log once.
        if (err instanceof Error && err.name === "SecurityError") {
          console.warn(
            "useWakeLock: secure context required, not holding lock"
          );
        }
      }
    };

    const release = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {
          /* ignore */
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && shouldHoldRef.current) {
        void acquire();
      }
      // When the tab is hidden the browser releases the lock for us.
      // No explicit release call needed here.
    };

    if (shouldHold) {
      void acquire();
    } else {
      void release();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void release();
    };
  }, [shouldHold]);
}
