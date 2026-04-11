/**
 * Player state machine — the single source of truth for what the player
 * is doing at any moment. See docs/PLAYER_V2.md for the full spec.
 *
 * This file is pure data: types, constructors, predicates, and
 * selectors. No side effects, no audio, no timers. The supervisor
 * (see supervisor.ts) drives transitions; the store (playerStore.ts)
 * holds the current state and exposes it to the UI.
 */

import type { ParsedStation, Stream } from "../nostr/domain";

// ─── Timing constants ──────────────────────────────────────────────────────

export const PROBE_TIMEOUT_MS = 3000;
export const STALL_GRACE_MS = 3000;
export const BUFFER_PATIENCE_MS = 10000;
export const RECONNECT_BUDGET_MS = 60000;
export const RECONNECT_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];
export const FAILED_STREAM_TTL_MS = 60000;

// ─── Error classification ──────────────────────────────────────────────────

export type FailureReason =
  | "fatal" // stream URL won't work (codec, 404, CORS block)
  | "network" // transient (timeout, 5xx, stall)
  | "unknown"; // treat as network but log

export interface StreamFailure {
  url: string;
  at: number;
  reason: FailureReason;
  message: string;
}

// ─── Discriminated union: the state ─────────────────────────────────────────

export type PlayerState =
  | { kind: "idle" }
  | {
      kind: "loading";
      station: ParsedStation;
      attempt: number; // 1-indexed candidate attempt
      candidateCount: number;
      startedAt: number;
    }
  | {
      kind: "playing";
      station: ParsedStation;
      stream: Stream;
      since: number;
    }
  | {
      kind: "buffering";
      station: ParsedStation;
      stream: Stream;
      since: number; // when we entered buffering
    }
  | {
      kind: "reconnecting";
      station: ParsedStation;
      lastStream: Stream;
      attempt: number; // 1-indexed reconnect attempt
      startedAt: number; // when we entered reconnecting
      nextAttemptAt: number; // ms timestamp for next retry
    }
  | {
      kind: "failed";
      station: ParsedStation;
      reason: FailureReason;
      message: string;
      attemptedStreams: StreamFailure[];
    }
  | {
      kind: "paused";
      station: ParsedStation;
      stream: Stream;
    };

// ─── Constructors ──────────────────────────────────────────────────────────
//
// Thin factories so call sites read naturally and TypeScript can narrow
// without extra annotation.

export const idleState = (): PlayerState => ({ kind: "idle" });

export const loadingState = (
  station: ParsedStation,
  candidateCount: number,
  attempt = 1
): PlayerState => ({
  kind: "loading",
  station,
  attempt,
  candidateCount,
  startedAt: Date.now(),
});

export const playingState = (
  station: ParsedStation,
  stream: Stream
): PlayerState => ({
  kind: "playing",
  station,
  stream,
  since: Date.now(),
});

export const bufferingState = (
  station: ParsedStation,
  stream: Stream
): PlayerState => ({
  kind: "buffering",
  station,
  stream,
  since: Date.now(),
});

export const reconnectingState = (
  station: ParsedStation,
  lastStream: Stream,
  attempt: number,
  startedAt: number,
  delayMs: number
): PlayerState => ({
  kind: "reconnecting",
  station,
  lastStream,
  attempt,
  startedAt,
  nextAttemptAt: Date.now() + delayMs,
});

export const failedState = (
  station: ParsedStation,
  reason: FailureReason,
  message: string,
  attemptedStreams: StreamFailure[]
): PlayerState => ({
  kind: "failed",
  station,
  reason,
  message,
  attemptedStreams,
});

export const pausedState = (
  station: ParsedStation,
  stream: Stream
): PlayerState => ({
  kind: "paused",
  station,
  stream,
});

// ─── Predicates ────────────────────────────────────────────────────────────

export function hasStation(
  state: PlayerState
): state is Exclude<PlayerState, { kind: "idle" }> {
  return state.kind !== "idle";
}

export function isActive(state: PlayerState): boolean {
  return (
    state.kind === "playing" ||
    state.kind === "buffering" ||
    state.kind === "loading" ||
    state.kind === "reconnecting"
  );
}

export function isPaused(state: PlayerState): boolean {
  return state.kind === "paused";
}

export function isFailed(state: PlayerState): boolean {
  return state.kind === "failed";
}

// ─── Compat selectors ──────────────────────────────────────────────────────
//
// The rest of the app (RadioCard, StationDetail, AnimatedLogo,
// useMediaSession) was written against the old flat fields. These
// selectors derive those flat fields from the new union so callers
// keep working without edits.

export function selectCurrentStation(
  state: PlayerState
): ParsedStation | null {
  return hasStation(state) ? state.station : null;
}

export function selectCurrentStream(state: PlayerState): Stream | null {
  switch (state.kind) {
    case "playing":
    case "buffering":
    case "paused":
      return state.stream;
    case "reconnecting":
      return state.lastStream;
    default:
      return null;
  }
}

/**
 * True only when audio is actively advancing. `buffering` is NOT
 * playing — the station is loaded but the audio is stalled. This is
 * the signal the rest of the UI uses to render play-vs-pause icons,
 * so we want it to match user perception.
 */
export function selectIsPlaying(state: PlayerState): boolean {
  return state.kind === "playing";
}

/**
 * True whenever we're doing work the user should see as "in progress":
 * initial connection, mid-play buffering, or mid-play reconnection.
 * Differentiating these is the job of the UI reading `state.kind`;
 * this flag is just for coarse "show a spinner" legacy callers.
 */
export function selectIsLoading(state: PlayerState): boolean {
  return (
    state.kind === "loading" ||
    state.kind === "buffering" ||
    state.kind === "reconnecting"
  );
}

/**
 * User-facing error message. Only set in `failed`. Buffering and
 * reconnecting are NOT errors — they're expected recovery states and
 * should not surface as red banners.
 */
export function selectError(state: PlayerState): string | null {
  return state.kind === "failed" ? state.message : null;
}

// ─── Time helpers ──────────────────────────────────────────────────────────

export function timeInState(state: PlayerState, now = Date.now()): number {
  switch (state.kind) {
    case "playing":
    case "buffering":
      return now - state.since;
    case "loading":
      return now - state.startedAt;
    case "reconnecting":
      return now - state.startedAt;
    default:
      return 0;
  }
}

export function backoffFor(attempt: number): number {
  const idx = Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1);
  // small amount of jitter so multiple clients don't all retry in lockstep
  const base = RECONNECT_BACKOFF_MS[idx] ?? 30000;
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}
