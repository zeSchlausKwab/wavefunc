import { create } from "zustand";
import type { NDKStation } from "../lib/NDKStation";

interface UIState {
  // Login prompt animation
  shouldPulseLogin: boolean;
  pulseLogin: () => void;
  clearLoginPulse: () => void;

  // Bottom sheet
  sheetOpen: boolean;
  sheetMode: "nav" | "station";
  sheetStation: NDKStation | null;
  sheetSnap: "peek" | "expanded";
  sheetFocusComment: boolean;
  openNavSheet: () => void;
  openStationSheet: (station: NDKStation, focusComment?: boolean) => void;
  closeSheet: () => void;
  setSheetSnap: (snap: "peek" | "expanded") => void;
  clearCommentFocus: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  shouldPulseLogin: false,

  pulseLogin: () => {
    set({ shouldPulseLogin: true });
    setTimeout(() => {
      set({ shouldPulseLogin: false });
    }, 1000);
  },

  clearLoginPulse: () => set({ shouldPulseLogin: false }),

  sheetOpen: false,
  sheetMode: "nav",
  sheetStation: null,
  sheetSnap: "peek",
  sheetFocusComment: false,

  openNavSheet: () =>
    set({ sheetOpen: true, sheetMode: "nav", sheetSnap: "peek" }),

  openStationSheet: (station, focusComment = false) =>
    set({
      sheetOpen: true,
      sheetMode: "station",
      sheetStation: station,
      sheetSnap: "expanded",
      sheetFocusComment: focusComment,
    }),

  closeSheet: () => set({ sheetOpen: false }),

  setSheetSnap: (snap) => set({ sheetSnap: snap }),

  clearCommentFocus: () => set({ sheetFocusComment: false }),
}));
