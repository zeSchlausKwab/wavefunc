import { create } from "zustand";
import type { NDKStation, Stream } from "../lib/NDKStation";
import Hls from "hls.js";
import {
  extractStreamMetadata,
  searchMusicBrainz,
} from "../lib/metadataClient";
import {
  normalizeUrl,
  playWithAdapter,
  sortStreamsByPreference,
} from "../lib/player/adapters";

interface CurrentMetadata {
  title?: string;
  artist?: string;
  song?: string;
  station?: string;
  genre?: string;
  bitrate?: string;
  musicBrainz?: {
    id: string;
    title: string;
    artist: string;
    release?: string;
    releaseDate?: string;
    duration?: number;
    tags?: string[];
  };
}

interface PlayerState {
  // Current playing state
  currentStation: NDKStation | null;
  currentStream: Stream | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;

  // Metadata
  currentMetadata: CurrentMetadata | null;
  metadataInterval: ReturnType<typeof setInterval> | null;

  // Audio element reference (managed externally)
  audioElement: HTMLAudioElement | null;
  hlsInstance: Hls | null;

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
  setHlsInstance: (hls: Hls | null) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  currentStation: null,
  currentStream: null,
  isPlaying: false,
  isLoading: false,
  error: null,
  currentMetadata: null,
  metadataInterval: null,
  audioElement: null,
  hlsInstance: null,
  volume: 0.7,
  isMuted: false,

  // Play a new station
  playStation: (station: NDKStation, stream?: Stream) => {
    const { currentStation, currentStream, audioElement } = get();

    // Validation
    const allStreams = sortStreamsByPreference(station.streams);
    const preferred = stream ? { ...stream, url: normalizeUrl(stream.url) } : null;
    const candidates = preferred
      ? [preferred, ...allStreams.filter((s) => s.url !== preferred.url)]
      : allStreams;

    if (candidates.length === 0) {
      console.error("playerStore: No stream available!");
      set({ error: "No stream available for this station" });
      return;
    }

    // Early return: resume if same station/stream already loaded
    if (
      currentStation?.id === station.id &&
      currentStream?.url === candidates[0]?.url &&
      audioElement
    ) {
      audioElement.play();
      set({ isPlaying: true, error: null });
      return;
    }

    // Guard: ensure audio element exists
    if (!audioElement) {
      console.error("playerStore: No audio element available!");
      set({ error: "Audio player not initialized", isLoading: false });
      return;
    }

    // Clean up existing metadata interval
    const { metadataInterval: existingInterval } = get();
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Begin loading state and clear old metadata
    set({
      currentStation: station,
      currentStream: candidates[0],
      isLoading: true,
      error: null,
      isPlaying: false,
      currentMetadata: null,
      metadataInterval: null,
    });

    // Clean up existing HLS instance if any
    const { hlsInstance } = get();
    if (hlsInstance) {
      hlsInstance.destroy();
      set({ hlsInstance: null });
    }

    // Try candidates sequentially until one plays
    (async () => {
      let played = false;
      let lastError: Error | null = null;
      for (const candidate of candidates) {
        try {
          // Update currentStream as we attempt
          set({ currentStream: candidate });
          const result = await playWithAdapter(candidate, audioElement);
          if (result.hls) {
            set({ hlsInstance: result.hls });
          }
          set({ isPlaying: true, isLoading: false, error: null });
          played = true;

          // Start metadata polling for the successful candidate
          const { metadataInterval } = get();
          if (metadataInterval) clearInterval(metadataInterval);

          const pollMetadata = async () => {
            try {
              const metadata = await extractStreamMetadata(candidate.url);

              if (metadata.artist && metadata.song && !metadata.error) {
                const mbResults = await searchMusicBrainz({
                  artist: metadata.artist,
                  track: metadata.song,
                });
                set({
                  currentMetadata: {
                    ...metadata,
                    musicBrainz: mbResults[0],
                  },
                });
              } else if (!metadata.error) {
                set({ currentMetadata: metadata });
              }
            } catch (err) {
              console.error("Metadata polling error:", err);
            }
          };

          // Poll immediately, then every 15 seconds
          pollMetadata();
          const interval = setInterval(pollMetadata, 15000);
          set({ metadataInterval: interval });

          break; // stop trying next candidates
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Failed to play");
          // Try next candidate
          continue;
        }
      }

      if (!played) {
        set({
          error: `Failed to play any stream${lastError ? `: ${lastError.message}` : ""}`,
          isLoading: false,
          isPlaying: false,
        });
      }
    })();
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
    const { audioElement, hlsInstance, metadataInterval } = get();

    // Clean up HLS
    if (hlsInstance) {
      hlsInstance.destroy();
    }

    // Clean up metadata polling
    if (metadataInterval) {
      clearInterval(metadataInterval);
    }

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
      currentMetadata: null,
      metadataInterval: null,
      hlsInstance: null,
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
  setHlsInstance: (hls: Hls | null) => set({ hlsInstance: hls }),
}));
