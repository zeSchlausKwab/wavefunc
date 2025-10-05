import { create } from "zustand";
import type { NDKStation, Stream } from "../lib/NDKStation";
import Hls from "hls.js";

// Helper: Check if URL is HLS stream
const isHlsStream = (url: string): boolean => url.includes(".m3u8");

// Helper: Attempt to play audio with error handling
const attemptPlay = (
  audioElement: HTMLAudioElement,
  onSuccess: () => void,
  onError: (error: Error) => void
): void => {
  audioElement.play().then(onSuccess).catch(onError);
};

// Play HLS stream using HLS.js
const playHlsStream = (
  url: string,
  audioElement: HTMLAudioElement,
  onSuccess: () => void,
  onError: (error: Error) => void,
  setState: (state: any) => void
): void => {
  console.log("playerStore: Using HLS.js for .m3u8 stream");

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
  });

  hls.loadSource(url);
  hls.attachMedia(audioElement);

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    console.log("playerStore: HLS manifest parsed, attempting play...");
    attemptPlay(audioElement, onSuccess, onError);
  });

  hls.on(Hls.Events.ERROR, (event, data) => {
    console.error("playerStore: HLS error:", data);
    if (data.fatal) {
      setState({
        error: `Stream error: ${data.type}`,
        isLoading: false,
        isPlaying: false,
      });
    }
  });

  setState({ hlsInstance: hls });
};

// Play HLS stream using native Safari support
const playNativeHls = (
  url: string,
  audioElement: HTMLAudioElement,
  onSuccess: () => void,
  onError: (error: Error) => void
): void => {
  console.log("playerStore: Using native HLS support (Safari)");
  audioElement.src = url;
  audioElement.load();
  attemptPlay(audioElement, onSuccess, onError);
};

// Play regular audio stream
const playRegularStream = (
  url: string,
  audioElement: HTMLAudioElement,
  onSuccess: () => void,
  onError: (error: Error) => void
): void => {
  audioElement.src = url;
  audioElement.load();
  attemptPlay(audioElement, onSuccess, onError);
};

interface PlayerState {
  // Current playing state
  currentStation: NDKStation | null;
  currentStream: Stream | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;

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
  audioElement: null,
  hlsInstance: null,
  volume: 0.7,
  isMuted: false,

  // Play a new station
  playStation: (station: NDKStation, stream?: Stream) => {
    const selectedStream = stream || station.streams[0];

    // Validation
    if (!selectedStream) {
      console.error("playerStore: No stream available!");
      set({ error: "No stream available for this station" });
      return;
    }

    const { currentStation, currentStream, audioElement } = get();

    // Early return: resume if same station is already loaded
    if (
      currentStation?.id === station.id &&
      currentStream?.url === selectedStream.url &&
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

    // Update state for new station
    set({
      currentStation: station,
      currentStream: selectedStream,
      isLoading: true,
      error: null,
      isPlaying: false,
    });

    // Clean up existing HLS instance if any
    const { hlsInstance } = get();
    if (hlsInstance) {
      hlsInstance.destroy();
      set({ hlsInstance: null });
    }

    // Handlers for play success/failure
    const handlePlaySuccess = () => {
      set({ isPlaying: true, isLoading: false });
    };

    const handlePlayError = (error: Error) => {
      console.error("playerStore: Play failed:", error);
      set({
        error: `Failed to play: ${error.message}`,
        isLoading: false,
        isPlaying: false,
      });
    };

    // Route to appropriate playback method
    const isHLS = isHlsStream(selectedStream.url);

    if (isHLS && Hls.isSupported()) {
      playHlsStream(
        selectedStream.url,
        audioElement,
        handlePlaySuccess,
        handlePlayError,
        set
      );
    } else if (
      isHLS &&
      audioElement.canPlayType("application/vnd.apple.mpegurl")
    ) {
      playNativeHls(
        selectedStream.url,
        audioElement,
        handlePlaySuccess,
        handlePlayError
      );
    } else {
      playRegularStream(
        selectedStream.url,
        audioElement,
        handlePlaySuccess,
        handlePlayError
      );
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
    const { audioElement, hlsInstance } = get();

    // Clean up HLS
    if (hlsInstance) {
      hlsInstance.destroy();
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
