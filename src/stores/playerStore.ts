/**
 * Player store — the thin reactive wrapper around the PlaybackSupervisor.
 *
 * The supervisor (src/lib/player/supervisor.ts) owns the hard work:
 * audio element events, candidate fallback, reconnect, probe. This
 * store holds the state machine output, exposes a stable compat API
 * for existing callers, and manages volume/mute and the Web Audio
 * visualization graph.
 *
 * See docs/PLAYER_V2.md for the design rationale.
 */

import { create } from "zustand";
import type { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import {
  decodeAddressPointer,
  decodeEventPointer,
} from "applesauce-core/helpers/pointers";
import { firstValueFrom, filter, timeout } from "rxjs";

import {
  getDefaultSelectedStream,
  openStreamExternally,
} from "../lib/player/adapters";
import { isTauri } from "../config/env";
import { PlaybackSupervisor } from "../lib/player/supervisor";
import {
  idleState,
  selectCurrentStation,
  selectCurrentStream,
  selectError,
  selectIsLoading,
  selectIsPlaying,
  type PlayerState,
} from "../lib/player/state";
import {
  parseStationEvent,
  type ParsedStation,
  type Stream,
} from "../lib/nostr/domain";

const LAST_STATION_KEY = "wavefunc_last_station";

// Track which audio elements have been connected to Web Audio API.
// WeakMap so we don't hold refs to dead elements, and so HMR can
// re-attach without creating a second AudioContext per element.
const connectedAudioElements = new WeakMap<
  HTMLAudioElement,
  {
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaElementAudioSourceNode;
  }
>();

const saveLastStation = (stationId: string) => {
  try {
    localStorage.setItem(LAST_STATION_KEY, stationId);
  } catch (err) {
    console.error("Failed to save last station to localStorage:", err);
  }
};

const loadLastStation = (): string | null => {
  try {
    return localStorage.getItem(LAST_STATION_KEY);
  } catch (err) {
    console.error("Failed to load last station from localStorage:", err);
    return null;
  }
};

interface PlayerStoreState {
  // Source of truth — the state machine
  state: PlayerState;

  // Compat fields, derived from `state` on every update. Existing
  // callers read these directly; new code should prefer `state.kind`
  // for precision.
  currentStation: ParsedStation | null;
  currentStream: Stream | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;

  // Volume / mute (independent of playback state)
  volume: number;
  isMuted: boolean;

  // Audio element + supervisor (managed internally after setAudioElement)
  audioElement: HTMLAudioElement | null;
  supervisor: PlaybackSupervisor | null;

  // Web Audio API visualization graph
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  sourceNode: MediaElementAudioSourceNode | null;

  // Actions
  playStation: (station: ParsedStation, stream?: Stream) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  retry: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setAudioElement: (element: HTMLAudioElement | null) => void;
  restoreLastStation: (eventStore: EventStore) => Promise<void>;
  getLastStationId: () => string | null;
}

function deriveCompat(state: PlayerState): Pick<
  PlayerStoreState,
  "currentStation" | "currentStream" | "isPlaying" | "isLoading" | "error"
> {
  return {
    currentStation: selectCurrentStation(state),
    currentStream: selectCurrentStream(state),
    isPlaying: selectIsPlaying(state),
    isLoading: selectIsLoading(state),
    error: selectError(state),
  };
}

// User-gesture watermark for auto-link-out. When the user clicks play,
// we stamp this with the click time. If the supervisor later transitions
// to `failed` for that same station within the user-activation window,
// we automatically open the original stream URL in a new tab — saves the
// user the second click on the failed-state OPEN_SOURCE affordance.
//
// Browsers gate window.open() on a recent user activation; engines vary
// (~5s typical). We allow a generous 8s here — a popup blocker just
// means the user falls back to the manual OPEN_SOURCE button, no harm
// done. Tauri is excluded entirely: it plays http natively and spawning
// the OS browser from the WebView is hostile UX.
const AUTO_LINKOUT_WINDOW_MS = 8000;
let lastUserPlayAt = 0;
let lastUserPlayStationId: string | null = null;

export const usePlayerStore = create<PlayerStoreState>((set, get) => ({
  // Initial state
  state: idleState(),
  ...deriveCompat(idleState()),
  volume: 0.7,
  isMuted: false,
  audioElement: null,
  supervisor: null,
  audioContext: null,
  analyser: null,
  sourceNode: null,

  // ─── Playback actions ───────────────────────────────────────────────

  playStation: (station, stream) => {
    const { supervisor, audioContext } = get();
    if (!supervisor) {
      console.error(
        "playerStore.playStation: no supervisor (audio element not mounted)"
      );
      return;
    }

    // CRITICAL: Chrome (and most Chromium WebViews) keep newly-created
    // AudioContexts in `suspended` state until a user gesture resumes
    // them. When the audio element is piped through
    // createMediaElementSource (for our visualization graph), the
    // element's direct output is replaced by the graph — and if the
    // context is suspended, that graph produces SILENCE even though
    // `audio.play()` reports success and `<audio>.paused` is false.
    //
    // This must happen synchronously inside the click handler path
    // (playStation is called from a user click), otherwise the
    // user-gesture permission is lost before `resume()` completes.
    if (audioContext && audioContext.state === "suspended") {
      // Fire-and-forget — the resume is async but doesn't need to
      // block the supervisor.start() call below; the audio element
      // will start playing as soon as the context unsuspends.
      void audioContext.resume();
    }

    // Persist last-station + add to history on user-initiated play.
    const stationId = station.naddr || station.id;
    if (stationId) {
      saveLastStation(stationId);
      import("./historyStore").then(({ useHistoryStore }) => {
        useHistoryStore.getState().addToHistory(stationId);
      });
    }

    // Watermark for auto-link-out: if all in-app candidates fail within
    // ~8s of this click, we'll pop the original stream open externally.
    lastUserPlayAt = Date.now();
    lastUserPlayStationId = station.id;

    void supervisor.start(station, stream);
  },

  pause: () => {
    const { supervisor } = get();
    supervisor?.pause();
  },

  resume: () => {
    const { supervisor, state, audioElement, audioContext } = get();
    if (!supervisor) return;

    // Same rationale as playStation: resume the context on user gesture.
    if (audioContext && audioContext.state === "suspended") {
      void audioContext.resume();
    }

    if (state.kind === "paused") {
      // Two sub-cases:
      // 1. We were playing and the user paused — supervisor state is
      //    also `paused`, just call supervisor.resume().
      // 2. We just restored a station from localStorage on app load
      //    and set the store state to `paused` without telling the
      //    supervisor — supervisor state is `idle`. Kick off a fresh
      //    start for the stored station.
      const supervisorState = supervisor.getState();
      if (supervisorState.kind === "paused") {
        void supervisor.resume();
      } else {
        void supervisor.start(state.station, state.stream);
      }
      return;
    }
    if (state.kind === "idle") {
      console.warn("playerStore.resume: no station to resume");
      return;
    }
    // Defensive fallback: user tapped play during loading/reconnecting
    // — nudge the audio element. Supervisor will handle error events
    // normally.
    if (audioElement && audioElement.paused) {
      audioElement.play().catch(() => {
        /* supervisor handles errors */
      });
    }
  },

  stop: () => {
    const { supervisor } = get();
    supervisor?.stop();
  },

  retry: () => {
    const { supervisor } = get();
    void supervisor?.retry();
  },

  // ─── Volume ─────────────────────────────────────────────────────────

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const { audioElement } = get();
    if (audioElement) audioElement.volume = clamped;
    set({ volume: clamped });
  },

  toggleMute: () => {
    const { isMuted, audioElement } = get();
    const next = !isMuted;
    if (audioElement) audioElement.muted = next;
    set({ isMuted: next });
  },

  // ─── Audio element lifecycle ───────────────────────────────────────

  setAudioElement: (element) => {
    const { supervisor: oldSupervisor, volume, isMuted } = get();

    // Dispose any previous supervisor — only one per audio element.
    if (oldSupervisor) {
      oldSupervisor.dispose();
    }

    if (!element) {
      set({
        audioElement: null,
        supervisor: null,
        audioContext: null,
        analyser: null,
        sourceNode: null,
      });
      return;
    }

    // Sync current volume/mute to the new element.
    element.volume = volume;
    element.muted = isMuted;

    // Create (or reuse) the Web Audio graph for this element. Reused
    // across HMR thanks to the WeakMap.
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let sourceNode: MediaElementAudioSourceNode | null = null;
    const existing = connectedAudioElements.get(element);
    if (existing) {
      audioContext = existing.context;
      analyser = existing.analyser;
      sourceNode = existing.source;
    } else {
      try {
        const context = new AudioContext();
        const an = context.createAnalyser();
        an.fftSize = 64;
        an.smoothingTimeConstant = 0.8;
        const source = context.createMediaElementSource(element);
        source.connect(an);
        an.connect(context.destination);
        connectedAudioElements.set(element, { context, analyser: an, source });
        audioContext = context;
        analyser = an;
        sourceNode = source;
      } catch (err) {
        console.error("Failed to initialize Web Audio API:", err);
      }
    }

    // Spin up a new supervisor. The listener updates both the state
    // machine field and the derived compat fields in one shot, and
    // owns the auto-link-out side effect for `failed` transitions.
    const supervisor = new PlaybackSupervisor(element, (next) => {
      const prev = get().state;
      set({ state: next, ...deriveCompat(next) });

      // Auto-link-out: if we just transitioned into `failed` for the
      // station the user actively asked to play, open the most-preferred
      // stream URL in a new tab. The URL we open is the *original*
      // (pre-https-upgrade) one, since that's what the failure summary
      // carries — and it's also what the user's browser will actually
      // route correctly when opened in a fresh tab (no mixed-content
      // blocking on a same-protocol page load).
      if (
        next.kind === "failed" &&
        prev.kind !== "failed" &&
        !isTauri() &&
        lastUserPlayStationId === next.station.id &&
        Date.now() - lastUserPlayAt < AUTO_LINKOUT_WINDOW_MS
      ) {
        // Prefer the supervisor's first attempt (which is the candidate
        // we ranked highest). Fall back to the station's preferred
        // stream if the failed-state record is somehow empty.
        const firstAttempt = next.attemptedStreams[0];
        const fallback = next.station.streams[0];
        const url = firstAttempt?.url ?? fallback?.url;
        if (url) {
          // Clear the watermark so a manual retry doesn't auto-open
          // again on the same failure.
          lastUserPlayStationId = null;
          openStreamExternally(url);
        }
      }
    });

    set({
      audioElement: element,
      supervisor,
      audioContext,
      analyser,
      sourceNode,
    });
  },

  // ─── Last station persistence ──────────────────────────────────────

  restoreLastStation: async (eventStore) => {
    const lastStationId = loadLastStation();
    if (!lastStationId) return;

    try {
      const pointer =
        decodeAddressPointer(lastStationId) ??
        decodeEventPointer(lastStationId) ??
        lastStationId;
      const event = await firstValueFrom(
        eventStore.event(pointer).pipe(
          filter((value): value is NostrEvent => Boolean(value)),
          timeout(15000)
        )
      );
      if (event) {
        const station = parseStationEvent(event);
        const stream = getDefaultSelectedStream(station.streams);
        if (!stream) return;

        // Put the store into `paused` state without actually starting
        // playback. The user taps play to resume — we don't autoplay
        // on app launch (browser policies would block it anyway).
        const paused: PlayerState = {
          kind: "paused",
          station,
          stream,
        };
        set({ state: paused, ...deriveCompat(paused) });
      }
    } catch (err) {
      console.error("Failed to restore last station:", err);
    }
  },

  getLastStationId: () => loadLastStation(),
}));
