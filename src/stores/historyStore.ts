import { create } from "zustand";
import type { SongMetadataInput } from "../lib/nostr/domain/song";

export interface HistoryEntry {
  stationId: string;
  timestamp: number;
}

export interface HeardSong extends HistoryEntry {
  stationName: string;
  metadata: SongMetadataInput;
}

interface HistoryState {
  history: HistoryEntry[];
  songs: HeardSong[];
  addToHistory: (stationId: string) => void;
  recordSong: (entry: HeardSong, enrich: boolean) => void;
  clearHistory: () => void;
  clearSongs: () => void;
  removeFromHistory: (timestamp: number) => void;
  removeSong: (timestamp: number) => void;
}

const HISTORY_KEY = "wavefunc_play_history";
const SONGS_KEY = "wavefunc_song_history";
const MAX_ENTRIES = 50;

function loadHistory<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persist<T>(key: string, entries: T[]): T[] {
  const history = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch {
    // History still works in memory when browser storage is unavailable.
  }
  return history;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  history: loadHistory<HistoryEntry>(HISTORY_KEY),
  songs: loadHistory<HeardSong>(SONGS_KEY),
  addToHistory: stationId => set(state => ({
    history: persist(HISTORY_KEY, [{ stationId, timestamp: Date.now() }, ...state.history]),
  })),
  recordSong: (entry, enrich) => set(state => {
    // Keep the original listening time when MusicBrainz finishes. A listener
    // may have deleted this entry while enrichment was still in flight.
    if (enrich && state.songs[0]?.timestamp !== entry.timestamp) return state;
    return { songs: persist(SONGS_KEY, [entry, ...(enrich ? state.songs.slice(1) : state.songs)]) };
  }),
  clearHistory: () => set({ history: persist(HISTORY_KEY, []) }),
  clearSongs: () => set({ songs: persist(SONGS_KEY, []) }),
  removeFromHistory: timestamp => set(state => ({
    history: persist(HISTORY_KEY, state.history.filter(entry => entry.timestamp !== timestamp)),
  })),
  removeSong: timestamp => set(state => ({
    songs: persist(SONGS_KEY, state.songs.filter(entry => entry.timestamp !== timestamp)),
  })),
}));
