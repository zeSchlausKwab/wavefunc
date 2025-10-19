import { create } from "zustand";

interface UIState {
  // Login prompt animation
  shouldPulseLogin: boolean;
  pulseLogin: () => void;
  clearLoginPulse: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  shouldPulseLogin: false,

  pulseLogin: () => {
    set({ shouldPulseLogin: true });
    // Auto-clear after animation duration
    setTimeout(() => {
      set({ shouldPulseLogin: false });
    }, 1000);
  },

  clearLoginPulse: () => set({ shouldPulseLogin: false }),
}));