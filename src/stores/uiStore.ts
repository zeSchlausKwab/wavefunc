import { create } from "zustand";
import type { ParsedStation } from "../lib/nostr/domain";

interface UIState {
  // Login prompt animation
  shouldPulseLogin: boolean;
  pulseLogin: () => void;
  clearLoginPulse: () => void;

  // Root-owned support flow. Keeping this outside navigation sheets prevents
  // nested overlays and lets mobile navigation close before support opens.
  supportOpen: boolean;
  openSupport: () => void;
  closeSupport: () => void;

  // Mobile navigation sidebar. This is deliberately separate from the
  // contextual station sheet so global navigation and station inspection do
  // not compete for the same overlay state.
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;

  // Station detail bottom sheet
  stationSheetOpen: boolean;
  sheetStation: ParsedStation | null;
  sheetSnap: "peek" | "expanded";
  sheetFocusComment: boolean;
  openStationSheet: (station: ParsedStation, focusComment?: boolean) => void;
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

  supportOpen: false,
  openSupport: () =>
    set({
      supportOpen: true,
      sidebarOpen: false,
      stationSheetOpen: false,
    }),
  closeSupport: () => set({ supportOpen: false }),

  sidebarOpen: false,
  openSidebar: () =>
    set({
      sidebarOpen: true,
      stationSheetOpen: false,
    }),
  closeSidebar: () => set({ sidebarOpen: false }),

  stationSheetOpen: false,
  sheetStation: null,
  sheetSnap: "peek",
  sheetFocusComment: false,

  openStationSheet: (station, focusComment = false) =>
    set({
      sidebarOpen: false,
      stationSheetOpen: true,
      sheetStation: station,
      sheetSnap: "expanded",
      sheetFocusComment: focusComment,
    }),

  closeSheet: () => set({ stationSheetOpen: false }),

  setSheetSnap: (snap) => set({ sheetSnap: snap }),

  clearCommentFocus: () => set({ sheetFocusComment: false }),
}));
