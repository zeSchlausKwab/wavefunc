/**
 * Tiny brutalist toast store.
 *
 * Toasts surface async outcomes (especially failures) the user wouldn't
 * otherwise see — the obvious case is "this stream wouldn't play in the
 * browser". We deliberately don't pull in a third-party toast library:
 * the visual language here doesn't match anything off-the-shelf, and
 * the API surface we need is small.
 *
 * Usage:
 *   import { showToast } from "../stores/toastStore";
 *   showToast({
 *     title: "CONNECTION_FAILED",
 *     message: "Stream couldn't play in the browser.",
 *     tone: "error",
 *     action: { label: "OPEN_IN_SOURCE", onClick: () => openExternally(url) },
 *   });
 */

import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Auto-dismiss after this many ms. 0 means "stay until dismissed". */
  durationMs: number;
  createdAt: number;
}

interface ToastInput {
  title?: string;
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  durationMs?: number;
  /**
   * If set, a previous toast with the same `key` is replaced rather
   * than stacked. Useful for "the same failure happened again" so the
   * UI doesn't accumulate duplicate toasts.
   */
  key?: string;
}

interface ToastStore {
  toasts: Toast[];
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let toastCounter = 0;
function nextId() {
  toastCounter += 1;
  return `t${toastCounter}-${Date.now()}`;
}

const DEFAULT_DURATION_MS = 6000;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: ({ title, message, tone = "info", action, durationMs, key }) => {
    const id = key ? `key:${key}` : nextId();
    const toast: Toast = {
      id,
      title,
      message,
      tone,
      action,
      durationMs: durationMs ?? DEFAULT_DURATION_MS,
      createdAt: Date.now(),
    };

    set((state) => {
      // Replace any existing toast that shares this key — avoids
      // stacking duplicates when the same failure recurs.
      const filtered = key
        ? state.toasts.filter((t) => t.id !== id)
        : state.toasts;
      return { toasts: [...filtered, toast] };
    });

    if (toast.durationMs > 0) {
      setTimeout(() => {
        get().dismiss(id);
      }, toast.durationMs);
    }

    return id;
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/** Convenience helper so callers don't need to subscribe. */
export function showToast(input: ToastInput): string {
  return useToastStore.getState().show(input);
}

export function dismissToast(id: string): void {
  useToastStore.getState().dismiss(id);
}
