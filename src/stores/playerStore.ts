import { create } from "zustand";
import type { NDKStation, Stream } from "../lib/NDKStation";

interface PlayerState {
  // Current playing state
  currentStation: NDKStation | null;
  currentStream: Stream | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;

  // Audio element reference (managed externally)
  audioElement: HTMLAudioElement | null;

  // Volume and controls
  volume: number;
  isMuted: boolean;

  // Actions
  playStation: (station: NDKStation, stream?: Stream) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setAudioElement: (element: HTMLAudioElement | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  currentStation: null,
  currentStream: null,
  isPlaying: false,
  isLoading: false,
  error: null,
  audioElement: null,
  volume: 0.7,
  isMuted: false,

  // Play a new station
  playStation: (station: NDKStation, stream?: Stream) => {
    const selectedStream = stream || station.streams[0];

    if (!selectedStream) {
      console.error("playerStore: No stream available!");
      set({ error: "No stream available for this station" });
      return;
    }

    const { currentStation, currentStream, audioElement } = get();
    if (
      currentStation?.id === station.id &&
      currentStream?.url === selectedStream.url &&
      audioElement
    ) {
      audioElement.play();
      set({ isPlaying: true, error: null });
      return;
    }

    // New station/stream
    set({
      currentStation: station,
      currentStream: selectedStream,
      isLoading: true,
      error: null,
      isPlaying: false,
    });

    // The audio element will handle the actual playback
    if (audioElement) {
      audioElement.src = selectedStream.url;
      Ï;
      audioElement.load();

      const playPromise = audioElement.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            set({ isPlaying: true, isLoading: false });
          })
          .catch((error) => {
            console.error("playerStore: Play failed:", error);
            set({
              error: `Failed to play: ${error.message}`,
              isLoading: false,
              isPlaying: false,
            });
          });
      }
    } else {
      console.error("playerStore: No audio element available!");
      set({
        error: "Audio player not initialized",
        isLoading: false,
      });
    }
  },

  // Pause playback
  pause: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      set({ isPlaying: false });
    }
  },

  // Resume playback
  resume: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.play();
      set({ isPlaying: true, error: null });
    }
  },

  // Stop playback and clear current station
  stop: () => {
    const { audioElement } = get();
    if (audioElement) {
      audioElement.pause();
      audioElement.src = "";
    }
    set({
      currentStation: null,
      currentStream: null,
      isPlaying: false,
      isLoading: false,
      error: null,
    });
  },

  // Set volume (0-1)
  setVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const { audioElement } = get();
    if (audioElement) {
      audioElement.volume = clampedVolume;
    }
    set({ volume: clampedVolume });
  },

  // Toggle mute
  toggleMute: () => {
    const { isMuted, audioElement } = get();
    if (audioElement) {
      audioElement.muted = !isMuted;
    }
    set({ isMuted: !isMuted });
  },

  // Setters for external updates
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setError: (error: string | null) => set({ error }),
  setAudioElement: (element: HTMLAudioElement | null) => {
    const { volume, isMuted } = get();
    if (element) {
      element.volume = volume;
      element.muted = isMuted;
    }
    set({ audioElement: element });
  },
}));
