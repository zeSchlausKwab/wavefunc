import { create } from "zustand";

export type SearchMode = "stations" | "musicbrainz";

interface SearchStore {
  searchQuery: string;
  searchMode: SearchMode;
  triggerSearch: boolean;

  setSearchQuery: (query: string) => void;
  setSearchMode: (mode: SearchMode) => void;
  triggerMusicBrainzSearch: (query: string) => void;
  resetTrigger: () => void;
}

export const useSearchStore = create<SearchStore>((set) => ({
  searchQuery: "",
  searchMode: "stations",
  triggerSearch: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchMode: (mode) => set({ searchMode: mode }),

  triggerMusicBrainzSearch: (query) =>
    set({
      searchQuery: query,
      searchMode: "musicbrainz",
      triggerSearch: true,
    }),

  resetTrigger: () => set({ triggerSearch: false }),
}));
