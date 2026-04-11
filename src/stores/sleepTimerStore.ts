/**
 * Sleep timer — "stop playback in N minutes" feature.
 *
 * Semantics chosen deliberately:
 * - The timer fires `usePlayerStore.stop()` when the target time is
 *   reached, unconditionally. It does NOT care what the player is
 *   doing at the time — if the user set a 30min timer, playback
 *   stops in 30min even if they switched to a different station
 *   in the meantime.
 * - The target timestamp (absolute ms since epoch) is persisted to
 *   localStorage on every set/cancel, so refreshing the app doesn't
 *   reset the timer. On boot, `rehydrate()` checks if the target is
 *   still in the future and re-schedules the setTimeout.
 * - Stopping playback manually does NOT cancel the timer — it just
 *   becomes a no-op when it fires. The user can explicitly cancel
 *   via the UI.
 * - Only one timer at a time. Setting a new one replaces the old.
 *
 * The actual setTimeout handle is internal. The UI observes
 * `targetAt` to render countdowns.
 */

import { create } from "zustand";

import { usePlayerStore } from "./playerStore";

const STORAGE_KEY = "wavefunc_sleep_timer_target";
// Clamp the timer to a reasonable max to avoid setTimeout overflow
// issues and footgun user inputs. 12 hours is more than enough for
// any sleep timer use case.
const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

interface SleepTimerState {
  /** Absolute ms timestamp when the timer will fire, or null if unset. */
  targetAt: number | null;

  // Internal — UI should not read this.
  _handle: ReturnType<typeof setTimeout> | null;

  /** Start a timer for `minutes` minutes from now. Replaces any existing timer. */
  setTimer: (minutes: number) => void;
  /** Clear the active timer, if any. */
  cancelTimer: () => void;
  /**
   * Rehydrate from localStorage on app boot. Call once from App.tsx.
   * If the stored target is in the past (app was closed through the
   * deadline), we clear it instead of firing retroactively — the user
   * probably doesn't want their station to stop the moment they
   * reopen the app.
   */
  rehydrate: () => void;
}

function persist(targetAt: number | null): void {
  try {
    if (targetAt === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(targetAt));
    }
  } catch (err) {
    console.error("sleepTimerStore: localStorage failed", err);
  }
}

function loadPersisted(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  targetAt: null,
  _handle: null,

  setTimer: (minutes) => {
    const current = get();
    // Replace any existing handle first.
    if (current._handle !== null) {
      clearTimeout(current._handle);
    }

    const durationMs = Math.min(
      Math.max(0, minutes * 60_000),
      MAX_DURATION_MS
    );
    if (durationMs === 0) {
      set({ targetAt: null, _handle: null });
      persist(null);
      return;
    }

    const targetAt = Date.now() + durationMs;
    const handle = setTimeout(() => {
      // Fire: stop playback and clear ourselves. We don't set new
      // state and THEN stop — if stop() throws for any reason, we
      // still want the timer cleared.
      set({ targetAt: null, _handle: null });
      persist(null);
      try {
        usePlayerStore.getState().stop();
      } catch (err) {
        console.error("sleepTimerStore: stop() failed", err);
      }
    }, durationMs);

    set({ targetAt, _handle: handle });
    persist(targetAt);
  },

  cancelTimer: () => {
    const current = get();
    if (current._handle !== null) {
      clearTimeout(current._handle);
    }
    set({ targetAt: null, _handle: null });
    persist(null);
  },

  rehydrate: () => {
    const stored = loadPersisted();
    if (stored === null) return;

    const remainingMs = stored - Date.now();
    if (remainingMs <= 0) {
      // Deadline already passed while the app was closed. Don't
      // retroactively fire — just clear.
      persist(null);
      return;
    }

    // Schedule a fresh timeout with the remaining duration.
    const handle = setTimeout(() => {
      useSleepTimerStore.setState({ targetAt: null, _handle: null });
      persist(null);
      try {
        usePlayerStore.getState().stop();
      } catch (err) {
        console.error("sleepTimerStore: stop() failed", err);
      }
    }, remainingMs);

    useSleepTimerStore.setState({ targetAt: stored, _handle: handle });
  },
}));
