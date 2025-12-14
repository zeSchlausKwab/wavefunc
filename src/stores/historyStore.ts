import { create } from "zustand";

export interface HistoryEntry {
  /** Station naddr or id */
  stationId: string;
  /** Timestamp when the station started playing */
  timestamp: number;
}

interface HistoryState {
  /** List of recently played stations (newest first) */
  history: HistoryEntry[];

  /** Add a station to history */
  addToHistory: (stationId: string) => void;

  /** Clear all history */
  clearHistory: () => void;

  /** Remove a specific entry from history */
  removeFromHistory: (timestamp: number) => void;
}

const HISTORY_KEY = "wavefunc_play_history";
const MAX_HISTORY_ENTRIES = 50;

// Load initial history from localStorage
const loadHistory = (): HistoryEntry[] => {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error("Failed to load play history from localStorage:", err);
  }
  return [];
};

// Save history to localStorage
const saveHistory = (history: HistoryEntry[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error("Failed to save play history to localStorage:", err);
  }
};

export const useHistoryStore = create<HistoryState>((set) => ({
  history: loadHistory(),

  addToHistory: (stationId: string) => {
    set((state) => {
      // Add new entry at the beginning
      const newEntry: HistoryEntry = {
        stationId,
        timestamp: Date.now(),
      };

      // Prepend new entry and limit to MAX_HISTORY_ENTRIES
      const newHistory = [newEntry, ...state.history].slice(
        0,
        MAX_HISTORY_ENTRIES
      );

      // Persist to localStorage
      saveHistory(newHistory);

      return { history: newHistory };
    });
  },

  clearHistory: () => {
    set({ history: [] });
    saveHistory([]);
  },

  removeFromHistory: (timestamp: number) => {
    set((state) => {
      const newHistory = state.history.filter(
        (entry) => entry.timestamp !== timestamp
      );
      saveHistory(newHistory);
      return { history: newHistory };
    });
  },
}));
