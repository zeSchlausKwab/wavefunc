import { create } from "zustand";

export interface FilterState {
  // Active filters
  genres: string[];
  languages: string[];
  countries: string[];
  searchQuery: string;

  // Actions
  setGenres: (genres: string[]) => void;
  addGenre: (genre: string) => void;
  removeGenre: (genre: string) => void;
  toggleGenre: (genre: string) => void;

  setLanguages: (languages: string[]) => void;
  addLanguage: (language: string) => void;
  removeLanguage: (language: string) => void;
  toggleLanguage: (language: string) => void;

  setCountries: (countries: string[]) => void;
  addCountry: (country: string) => void;
  removeCountry: (country: string) => void;
  toggleCountry: (country: string) => void;

  setSearchQuery: (query: string) => void;

  clearAllFilters: () => void;
  clearGenres: () => void;
  clearLanguages: () => void;
  clearCountries: () => void;

  // Utility
  hasActiveFilters: () => boolean;
  getActiveFilterCount: () => number;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  // Initial state
  genres: [],
  languages: [],
  countries: [],
  searchQuery: "",

  // Genre actions
  setGenres: (genres) => set({ genres }),
  addGenre: (genre) =>
    set((state) => ({
      genres: state.genres.includes(genre)
        ? state.genres
        : [...state.genres, genre],
    })),
  removeGenre: (genre) =>
    set((state) => ({
      genres: state.genres.filter((g) => g !== genre),
    })),
  toggleGenre: (genre) => {
    const state = get();
    if (state.genres.includes(genre)) {
      state.removeGenre(genre);
    } else {
      state.addGenre(genre);
    }
  },

  // Language actions
  setLanguages: (languages) => set({ languages }),
  addLanguage: (language) =>
    set((state) => ({
      languages: state.languages.includes(language)
        ? state.languages
        : [...state.languages, language],
    })),
  removeLanguage: (language) =>
    set((state) => ({
      languages: state.languages.filter((l) => l !== language),
    })),
  toggleLanguage: (language) => {
    const state = get();
    if (state.languages.includes(language)) {
      state.removeLanguage(language);
    } else {
      state.addLanguage(language);
    }
  },

  // Country actions
  setCountries: (countries) => set({ countries }),
  addCountry: (country) =>
    set((state) => ({
      countries: state.countries.includes(country)
        ? state.countries
        : [...state.countries, country],
    })),
  removeCountry: (country) =>
    set((state) => ({
      countries: state.countries.filter((c) => c !== country),
    })),
  toggleCountry: (country) => {
    const state = get();
    if (state.countries.includes(country)) {
      state.removeCountry(country);
    } else {
      state.addCountry(country);
    }
  },

  // Search query
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Clear actions
  clearAllFilters: () =>
    set({
      genres: [],
      languages: [],
      countries: [],
      searchQuery: "",
    }),
  clearGenres: () => set({ genres: [] }),
  clearLanguages: () => set({ languages: [] }),
  clearCountries: () => set({ countries: [] }),

  // Utility functions
  hasActiveFilters: () => {
    const state = get();
    return (
      state.genres.length > 0 ||
      state.languages.length > 0 ||
      state.countries.length > 0 ||
      state.searchQuery.trim() !== ""
    );
  },
  getActiveFilterCount: () => {
    const state = get();
    return (
      state.genres.length +
      state.languages.length +
      state.countries.length +
      (state.searchQuery.trim() ? 1 : 0)
    );
  },
}));
