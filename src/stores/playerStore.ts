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
import { useHistoryStore } from "./historyStore";

const LAST_STATION_KEY = "wavefunc_last_station";

// Track which audio elements have been connected to Web Audio API
// This persists across HMR reloads
const connectedAudioElements = new WeakMap<
  HTMLAudioElement,
  { context: AudioContext; analyser: AnalyserNode; source: MediaElementAudioSourceNode }
>();

// Save last played station to localStorage
const saveLastStation = (stationId: string) => {
  try {
    localStorage.setItem(LAST_STATION_KEY, stationId);
  } catch (err) {
    console.error("Failed to save last station to localStorage:", err);
  }
};

// Load last played station from localStorage
const loadLastStation = (): string | null => {
  try {
    return localStorage.getItem(LAST_STATION_KEY);
  } catch (err) {
    console.error("Failed to load last station from localStorage:", err);
    return null;
  }
};

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

  // Web Audio API for visualization
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  sourceNode: MediaElementAudioSourceNode | null;

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
  restoreLastStation: (ndk: any) => Promise<void>;
  getLastStationId: () => string | null;
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
  audioContext: null,
  analyser: null,
  sourceNode: null,
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

      // Resume audio context if suspended
      const { audioContext } = get();
      if (audioContext && audioContext.state === "suspended") {
        await audioContext.resume();
      }

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

          // Add to play history and save as last station
          const stationId = station.encode();
          if (stationId) {
            useHistoryStore.getState().addToHistory(stationId);
            saveLastStation(stationId);
          }

          // Start metadata polling for the successful candidate
          const { metadataInterval } = get();
          if (metadataInterval) clearInterval(metadataInterval);

          const pollMetadata = async () => {
            try {
              const metadata = await extractStreamMetadata(candidate.url);

              // Normalize metadata: ensure 'song' field is set from 'title' if needed
              const normalizedMetadata = {
                ...metadata,
                song: metadata.song || metadata.title,
              };

              if (normalizedMetadata.artist && normalizedMetadata.song && !metadata.error) {
                const mbResults = await searchMusicBrainz({
                  artist: normalizedMetadata.artist,
                  track: normalizedMetadata.song,
                });
                set({
                  currentMetadata: {
                    ...normalizedMetadata,
                    musicBrainz: mbResults[0],
                  },
                });
              } else if (!metadata.error) {
                set({ currentMetadata: normalizedMetadata });
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
    const { audioElement, audioContext } = get();
    if (audioElement) {
      // Resume audio context if it's suspended
      if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
      }
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

      // Check if this element already has Web Audio API connected
      const existing = connectedAudioElements.get(element);

      if (existing) {
        // Reuse existing Web Audio setup (happens during HMR)
        console.log("PlayerStore: Reusing existing Web Audio setup", existing);
        set({
          audioContext: existing.context,
          analyser: existing.analyser,
          sourceNode: existing.source
        });
      } else {
        // Create new Web Audio API setup for this element
        try {
          const context = new AudioContext();
          const analyser = context.createAnalyser();
          analyser.fftSize = 64; // Small FFT for 8x16 grid
          analyser.smoothingTimeConstant = 0.8;

          const source = context.createMediaElementSource(element);
          source.connect(analyser);
          analyser.connect(context.destination);

          // Store in WeakMap so we can reuse on HMR
          connectedAudioElements.set(element, { context, analyser, source });

          console.log("PlayerStore: Created Web Audio setup", { context, analyser, source, state: context.state });

          set({ audioContext: context, analyser, sourceNode: source });
        } catch (err) {
          console.error("Failed to initialize Web Audio API:", err);
        }
      }
    } else {
      // Note: We don't close the audio context here because the element
      // might still exist in the DOM (e.g., during HMR). The WeakMap will
      // clean up automatically when the element is garbage collected.
      set({ audioContext: null, analyser: null, sourceNode: null });
    }

    set({ audioElement: element });
  },
  setHlsInstance: (hls: Hls | null) => set({ hlsInstance: hls }),

  // Restore last played station from localStorage
  restoreLastStation: async (ndk: any) => {
    const lastStationId = loadLastStation();
    if (!lastStationId || !ndk) return;

    try {
      const event = await ndk.fetchEvent(lastStationId);
      if (event) {
        const station = NDKStation.from(event);
        // Set the station but don't auto-play (leave in pause mode)
        set({
          currentStation: station,
          currentStream: station.streams[0] || null,
          isPlaying: false,
          isLoading: false,
        });
      }
    } catch (err) {
      console.error("Failed to restore last station:", err);
    }
  },

  // Get the last station ID from localStorage
  getLastStationId: () => loadLastStation(),
}));
