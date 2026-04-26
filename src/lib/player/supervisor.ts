/**
 * PlaybackSupervisor — the engine that drives the player state
 * machine. Owns the `<audio>` element's playback-related event
 * listeners, the candidate fallback logic, and the reconnect loop.
 *
 * See docs/PLAYER_V2.md for the full spec. This file implements the
 * invariants listed there; read the spec before making non-trivial
 * changes.
 *
 * Usage:
 *   const sup = new PlaybackSupervisor(audioElement, onStateChange);
 *   sup.start(station, preferredStream);      // begin playback
 *   sup.pause();                               // user paused
 *   sup.resume();                              // user resumed
 *   sup.stop();                                // user stopped (→ idle)
 *   sup.retry();                               // user retried from failed
 *   sup.dispose();                             // tear down, release audio
 *
 * Invariant: at most one supervisor instance per audio element at any
 * time. The store guarantees this by disposing the previous supervisor
 * before creating a new one.
 */

import type Hls from "hls.js";

import type { ParsedStation, Stream } from "../nostr/domain";
import {
  canPlayStreamInApp,
  normalizeUrl,
  playWithAdapter,
  sortStreamsByPreference,
} from "./adapters";
import { probeStream } from "./probe";
import {
  BUFFER_PATIENCE_MS,
  FAILED_STREAM_TTL_MS,
  PLAY_ATTEMPT_TIMEOUT_MS,
  RECONNECT_BUDGET_MS,
  STALL_GRACE_MS,
  backoffFor,
  bufferingState,
  failedState,
  idleState,
  loadingState,
  pausedState,
  playingState,
  reconnectingState,
  type FailureReason,
  type PlayerState,
  type StreamFailure,
} from "./state";

type StateListener = (state: PlayerState) => void;

interface FailureRecord {
  at: number;
  reason: FailureReason;
  message: string;
}

/**
 * Classify a DOM MediaError code into our FailureReason taxonomy.
 * Codes defined by HTML spec:
 *   1 MEDIA_ERR_ABORTED       — user cancelled, never retry
 *   2 MEDIA_ERR_NETWORK       — transient
 *   3 MEDIA_ERR_DECODE        — usually transient but sometimes fatal
 *   4 MEDIA_ERR_SRC_NOT_SUPPORTED — fatal (codec or CORS)
 */
function classifyMediaError(
  code: number | undefined
): { reason: FailureReason; message: string } {
  switch (code) {
    case 1:
      return { reason: "unknown", message: "aborted" };
    case 2:
      return { reason: "network", message: "network error" };
    case 3:
      return { reason: "network", message: "decode error" };
    case 4:
      return { reason: "fatal", message: "format not supported" };
    default:
      return { reason: "unknown", message: "unknown media error" };
  }
}

export class PlaybackSupervisor {
  private readonly audio: HTMLAudioElement;
  private readonly listener: StateListener;

  private state: PlayerState = idleState();

  // Current playback context
  private station: ParsedStation | null = null;
  private candidates: Stream[] = [];
  private currentStream: Stream | null = null;
  private hls: Hls | null = null;

  // Failure tracking — URL → most recent failure within TTL window.
  // Old entries are pruned lazily when we pick the next candidate.
  private readonly failures = new Map<string, FailureRecord>();

  // Reconnect bookkeeping
  private reconnectStartedAt: number | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Stall bookkeeping — when did we enter a stall state?
  private stallStartedAt: number | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;

  // Abort controller for the in-flight probe (if any). Cleared on
  // completion or on stop/dispose.
  private probeAbort: AbortController | null = null;

  // A generation counter that bumps on every start()/stop()/dispose().
  // Async work tagged with a stale generation is ignored. This is how
  // we guard against a late probe/play completing after the user
  // already moved on to another station.
  private generation = 0;

  private disposed = false;

  constructor(audio: HTMLAudioElement, listener: StateListener) {
    this.audio = audio;
    this.listener = listener;
    this.attachAudioListeners();
  }

  // ─── Public API ──────────────────────────────────────────────────────

  getState(): PlayerState {
    return this.state;
  }

  async start(station: ParsedStation, preferredStream?: Stream): Promise<void> {
    if (this.disposed) return;

    // Cancel whatever's in flight. This bumps the generation, so any
    // pending async work will no-op when it resumes.
    this.cancelInFlight();

    this.station = station;
    this.candidates = this.buildCandidates(station, preferredStream);

    if (this.candidates.length === 0) {
      this.setState(
        failedState(
          station,
          "fatal",
          "No in-app stream available for this station",
          []
        )
      );
      return;
    }

    this.failures.clear();
    this.reconnectStartedAt = null;
    this.reconnectAttempt = 0;
    // Reset so enterReconnectingOrFail can tell "we never reached
    // playing on THIS start()" apart from "we played and the network
    // dropped". Without this, switching from a healthy station to a
    // dead one would still trigger the slow reconnect loop because
    // currentStream was left set by the previous session.
    this.currentStream = null;

    this.setState(loadingState(station, this.candidates.length));
    await this.runConnectLoop(this.generation);
  }

  pause(): void {
    if (this.disposed) return;

    const current = this.state;
    const stream =
      current.kind === "playing" || current.kind === "buffering"
        ? current.stream
        : current.kind === "reconnecting"
        ? current.lastStream
        : null;

    // Cancel any pending reconnect — user chose to pause, don't fight
    // them by reconnecting behind their back.
    this.clearReconnectTimer();
    this.clearStallTimer();
    this.cancelProbe();

    if (this.station && stream) {
      this.audio.pause();
      this.setState(pausedState(this.station, stream));
    }
  }

  async resume(): Promise<void> {
    if (this.disposed) return;

    if (this.state.kind !== "paused") return;
    const { station, stream } = this.state;

    // If the audio element still has the same source loaded, a simple
    // play() is enough. If the source was torn down (e.g., stream
    // source was set to "" during stop — we don't do this anymore, but
    // guard defensively), fall through to a fresh start.
    if (this.audio.src && !this.audio.error) {
      try {
        await this.audio.play();
        this.setState(playingState(station, stream));
        return;
      } catch {
        // fall through to a fresh start
      }
    }
    await this.start(station, stream);
  }

  stop(): void {
    if (this.disposed) return;
    this.cancelInFlight();
    this.detachStreamFromAudio();
    this.station = null;
    this.candidates = [];
    this.currentStream = null;
    this.failures.clear();
    this.setState(idleState());
  }

  async retry(): Promise<void> {
    if (this.disposed) return;
    if (this.state.kind !== "failed") return;
    const station = this.state.station;
    // Wipe failure table — user explicitly asked us to try again.
    this.failures.clear();
    await this.start(station);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelInFlight();
    this.detachAudioListeners();
    this.detachStreamFromAudio();
  }

  // ─── State plumbing ──────────────────────────────────────────────────

  private setState(next: PlayerState): void {
    this.state = next;
    this.listener(next);
  }

  private cancelInFlight(): void {
    this.generation++;
    this.cancelProbe();
    this.clearReconnectTimer();
    this.clearStallTimer();
  }

  private cancelProbe(): void {
    if (this.probeAbort) {
      this.probeAbort.abort();
      this.probeAbort = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearStallTimer(): void {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    this.stallStartedAt = null;
  }

  // ─── Candidate selection ────────────────────────────────────────────

  private buildCandidates(
    station: ParsedStation,
    preferredStream?: Stream
  ): Stream[] {
    const sorted = sortStreamsByPreference(station.streams).filter(
      canPlayStreamInApp
    );

    if (
      preferredStream &&
      canPlayStreamInApp(preferredStream)
    ) {
      const preferred: Stream = {
        ...preferredStream,
        url: normalizeUrl(preferredStream.url),
      };
      return [
        preferred,
        ...sorted.filter((s) => s.url !== preferred.url),
      ];
    }

    return sorted;
  }

  private pickNextCandidate(skip: Set<string> = new Set()): Stream | null {
    this.pruneExpiredFailures();

    const eligible = this.candidates.filter((s) => !skip.has(s.url));

    // Prefer candidates with no failure history
    const clean = eligible.filter((s) => !this.failures.has(s.url));
    if (clean.length > 0) return clean[0] ?? null;

    // Otherwise, candidates whose last failure was network (not fatal)
    const retriable = eligible.filter((s) => {
      const f = this.failures.get(s.url);
      return f && f.reason !== "fatal";
    });
    if (retriable.length > 0) {
      // Pick the one that failed longest ago — most likely recovered
      retriable.sort((a, b) => {
        const fa = this.failures.get(a.url)?.at ?? 0;
        const fb = this.failures.get(b.url)?.at ?? 0;
        return fa - fb;
      });
      return retriable[0] ?? null;
    }

    return null;
  }

  private pruneExpiredFailures(): void {
    const now = Date.now();
    for (const [url, failure] of this.failures.entries()) {
      if (now - failure.at > FAILED_STREAM_TTL_MS) {
        this.failures.delete(url);
      }
    }
  }

  private recordFailure(
    url: string,
    reason: FailureReason,
    message: string
  ): void {
    this.failures.set(url, { at: Date.now(), reason, message });
  }

  private allCandidatesFatal(): boolean {
    // True when every candidate has a fatal failure recorded within TTL.
    return this.candidates.every((s) => {
      const f = this.failures.get(s.url);
      return f && f.reason === "fatal";
    });
  }

  private attemptedSummary(): StreamFailure[] {
    return this.candidates
      .map((s) => {
        const f = this.failures.get(s.url);
        return f
          ? {
              url: s.url,
              at: f.at,
              reason: f.reason,
              message: f.message,
            }
          : null;
      })
      .filter((x): x is StreamFailure => x !== null);
  }

  // ─── Connect + attempt loop ─────────────────────────────────────────

  /**
   * Tries candidates in order until one plays or all fail. Called from
   * start() (initial connection) and from the reconnect loop. The
   * caller is responsible for setting the entry state (loading or
   * reconnecting); this method only transitions to playing / failed /
   * reconnecting based on results.
   */
  private async runConnectLoop(generation: number): Promise<void> {
    if (!this.station) return;

    // Track candidates we've tried in THIS connect cycle so we never
    // hand the same dead URL back to attemptStream within a single
    // run. Without this, pickNextCandidate's "retriable" branch — which
    // happily returns a network-failed candidate again under the
    // expectation that some time has passed — turned a single click
    // into an unbounded inner loop. Cycle-local skip set keeps the
    // outer reconnect cycle's retriable semantics intact while making
    // the inner loop terminate after one full pass.
    const triedThisCycle = new Set<string>();

    while (!this.disposed && generation === this.generation) {
      const candidate = this.pickNextCandidate(triedThisCycle);
      if (!candidate) {
        this.enterReconnectingOrFail(generation);
        return;
      }

      const result = await this.attemptStream(candidate, generation);
      if (generation !== this.generation) return; // superseded

      if (result.ok) {
        this.reconnectStartedAt = null;
        this.reconnectAttempt = 0;
        this.currentStream = candidate;
        this.setState(playingState(this.station, candidate));
        return;
      }

      this.recordFailure(candidate.url, result.reason, result.message);
      triedThisCycle.add(candidate.url);

      // Update the loading state to reflect progress, so the UI can
      // show "Trying stream 2 of 4…" without us needing a separate
      // event.
      if (this.state.kind === "loading") {
        this.setState({
          ...this.state,
          attempt: this.state.attempt + 1,
        });
      }
    }
  }

  private enterReconnectingOrFail(generation: number): void {
    if (!this.station) return;

    // If every candidate is marked fatal, bail out immediately.
    if (this.allCandidatesFatal()) {
      this.setState(
        failedState(
          this.station,
          "fatal",
          "All streams failed to start",
          this.attemptedSummary()
        )
      );
      return;
    }

    // Initial-connect failure: we exhausted candidates without ever
    // reaching `playing` for this start() call. Don't enter the 60s
    // reconnect cycle — that loop was designed for mid-stream drops
    // (the user was happily listening, then the network blipped). For
    // streams that never start (CORS blocks, dead http upstreams,
    // etc.) the reconnect just re-probes the same dead URL every
    // backoff tick, flooding the console with errors and starving the
    // auto-link-out window.
    //
    // Going straight to `failed` lets playerStore's failed-transition
    // listener pop the original URL externally inside the user's
    // activation window.
    if (this.currentStream === null) {
      this.setState(
        failedState(
          this.station,
          "network",
          "Stream did not start",
          this.attemptedSummary()
        )
      );
      return;
    }

    // Otherwise, schedule a reconnect. The budget starts on first
    // entry to reconnecting and persists across backoff cycles.
    const now = Date.now();
    if (this.reconnectStartedAt === null) {
      this.reconnectStartedAt = now;
      this.reconnectAttempt = 0;
    }

    if (now - this.reconnectStartedAt > RECONNECT_BUDGET_MS) {
      this.setState(
        failedState(
          this.station,
          "network",
          "Could not reconnect after repeated attempts",
          this.attemptedSummary()
        )
      );
      return;
    }

    const delay = backoffFor(this.reconnectAttempt);
    this.reconnectAttempt++;

    const lastStream =
      this.currentStream ?? this.candidates[0] ?? null;
    if (!lastStream) {
      this.setState(
        failedState(
          this.station,
          "fatal",
          "No streams available",
          this.attemptedSummary()
        )
      );
      return;
    }

    this.setState(
      reconnectingState(
        this.station,
        lastStream,
        this.reconnectAttempt,
        this.reconnectStartedAt,
        delay
      )
    );

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (generation !== this.generation) return;
      // During the backoff, failure TTLs may have expired, opening
      // up previously-failed candidates again.
      void this.runConnectLoop(this.generation);
    }, delay);
  }

  /**
   * Attempts to play a single candidate. Runs the probe first, then
   * hands off to the adapter. Returns success or a classified failure.
   */
  private async attemptStream(
    stream: Stream,
    generation: number
  ): Promise<
    { ok: true } | { ok: false; reason: FailureReason; message: string }
  > {
    // Probe first. We accept probe failure as an early signal but
    // don't treat it as authoritative — if we have no better
    // candidate later we'll try the audio element directly.
    this.probeAbort = new AbortController();
    const probe = await probeStream(stream.url, this.probeAbort.signal);
    this.probeAbort = null;

    if (generation !== this.generation) {
      return { ok: false, reason: "unknown", message: "superseded" };
    }

    if (!probe.ok && probe.reason === "fatal") {
      return { ok: false, reason: "fatal", message: probe.message };
    }
    // For network/timeout probe failures, continue to the audio
    // attempt anyway — the media loader may succeed where fetch
    // couldn't (CORS on the response is a common example).

    // Tear down any previous HLS instance before trying a new URL.
    this.detachStreamFromAudio();

    try {
      // Hard ceiling on a single attempt. Without this an unreachable
      // upstream (e.g. an http stream whose server has no TLS, after
      // our optimistic https upgrade) can keep the audio element
      // grinding for tens of seconds — and hls.js firing a steady
      // stream of console errors — before audio.play() finally
      // rejects. Six seconds is enough to start a healthy stream and
      // short enough that the user can move on.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const playPromise = playWithAdapter(stream, this.audio);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("play attempt timed out")),
          PLAY_ATTEMPT_TIMEOUT_MS
        );
      });
      let result;
      try {
        result = await Promise.race([playPromise, timeoutPromise]);
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
      if (result.hls) this.hls = result.hls;

      if (generation !== this.generation) {
        // Superseded during the play attempt. Tear down.
        this.detachStreamFromAudio();
        return { ok: false, reason: "unknown", message: "superseded" };
      }

      return { ok: true };
    } catch (err) {
      // If we got here via the timeout, ensure no audio element / hls
      // instance is left running in the background.
      this.detachStreamFromAudio();

      const message = err instanceof Error ? err.message : String(err);
      // If the browser says the source isn't supported, mark fatal.
      // Otherwise assume transient.
      const reason: FailureReason = /not supported|decoder/i.test(message)
        ? "fatal"
        : "network";
      return { ok: false, reason, message };
    }
  }

  // ─── Audio element event handling ────────────────────────────────────

  private attachAudioListeners(): void {
    this.audio.addEventListener("playing", this.onPlaying);
    this.audio.addEventListener("pause", this.onPause);
    this.audio.addEventListener("waiting", this.onWaiting);
    this.audio.addEventListener("stalled", this.onStalled);
    this.audio.addEventListener("canplay", this.onCanPlay);
    this.audio.addEventListener("error", this.onError);
    this.audio.addEventListener("ended", this.onEnded);
  }

  private detachAudioListeners(): void {
    this.audio.removeEventListener("playing", this.onPlaying);
    this.audio.removeEventListener("pause", this.onPause);
    this.audio.removeEventListener("waiting", this.onWaiting);
    this.audio.removeEventListener("stalled", this.onStalled);
    this.audio.removeEventListener("canplay", this.onCanPlay);
    this.audio.removeEventListener("error", this.onError);
    this.audio.removeEventListener("ended", this.onEnded);
  }

  private onPlaying = (): void => {
    // Fired when the audio element starts producing output after a
    // stall or initial load. This is our "stall cleared" signal.
    this.clearStallTimer();
    if (
      this.state.kind === "buffering" &&
      this.currentStream &&
      this.station
    ) {
      this.setState(playingState(this.station, this.currentStream));
    }
  };

  private onCanPlay = (): void => {
    this.clearStallTimer();
    // Don't force a transition here — `playing` state is set by the
    // connect loop after play() resolves, and mid-play recovery is
    // handled by `onPlaying`. `canplay` can fire during initial load
    // before play() returns, and we'd double-transition.
  };

  private onPause = (): void => {
    // The store drives pause transitions explicitly. We don't react
    // to the audio element's pause event because hls.js and some
    // adapters pause briefly during source switches and we don't
    // want to flip to `paused` state on that.
  };

  private onWaiting = (): void => {
    this.enterStall("waiting");
  };

  private onStalled = (): void => {
    this.enterStall("stalled");
  };

  private enterStall(_origin: string): void {
    if (this.state.kind !== "playing") return;
    // Only track a single stall at a time; ignore duplicates.
    if (this.stallTimer !== null) return;

    const { station, stream } = this.state;
    this.stallStartedAt = Date.now();

    // First, a grace period — short stalls are common and shouldn't
    // even show as buffering. After STALL_GRACE_MS we transition to
    // buffering state. After BUFFER_PATIENCE_MS total we escalate to
    // reconnecting.
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.state.kind !== "playing") return;
      // Still stalled — show buffering.
      this.setState(bufferingState(station, stream));

      // Schedule the escalation to reconnecting.
      this.stallTimer = setTimeout(() => {
        this.stallTimer = null;
        if (this.state.kind !== "buffering") return;
        this.recordFailure(stream.url, "network", "stalled");
        void this.runConnectLoop(this.generation);
      }, BUFFER_PATIENCE_MS - STALL_GRACE_MS);
    }, STALL_GRACE_MS);
  }

  private onError = (): void => {
    const mediaError = this.audio.error;
    const { reason, message } = classifyMediaError(mediaError?.code);

    const current = this.state;
    // Only react to errors when we're supposed to be playing. Errors
    // during stop() / src="" clearing are not user-visible.
    if (
      current.kind !== "playing" &&
      current.kind !== "buffering" &&
      current.kind !== "loading"
    ) {
      return;
    }

    const stream =
      current.kind === "playing" || current.kind === "buffering"
        ? current.stream
        : this.currentStream;

    if (stream) {
      this.recordFailure(stream.url, reason, message);
    }

    this.clearStallTimer();
    void this.runConnectLoop(this.generation);
  };

  private onEnded = (): void => {
    // Live streams shouldn't end. If they do, treat it as an error.
    if (
      this.state.kind === "playing" ||
      this.state.kind === "buffering"
    ) {
      const stream =
        this.state.kind === "playing" || this.state.kind === "buffering"
          ? this.state.stream
          : null;
      if (stream) {
        this.recordFailure(stream.url, "network", "stream ended");
      }
      void this.runConnectLoop(this.generation);
    }
  };

  // ─── Audio element teardown ────────────────────────────────────────

  private detachStreamFromAudio(): void {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        /* ignore */
      }
      this.hls = null;
    }
    // Note: we intentionally do NOT set `audio.src = ""` here. That
    // fires a spurious `error` event on many browsers which our
    // onError handler would have to guard against. Instead we just
    // call pause() and leave the src dangling; the next start() will
    // overwrite it cleanly.
    try {
      this.audio.pause();
    } catch {
      /* ignore */
    }
  }

  // ─── Introspection (for diagnostics panel) ──────────────────────────

  getDiagnostics(): {
    candidates: Array<{ url: string; failure?: FailureRecord }>;
    reconnectAttempt: number;
    reconnectStartedAt: number | null;
    buffered: number;
  } {
    const bufferedEnd =
      this.audio.buffered.length > 0
        ? this.audio.buffered.end(this.audio.buffered.length - 1)
        : 0;
    const buffered = Math.max(0, bufferedEnd - this.audio.currentTime);

    return {
      candidates: this.candidates.map((s) => ({
        url: s.url,
        failure: this.failures.get(s.url),
      })),
      reconnectAttempt: this.reconnectAttempt,
      reconnectStartedAt: this.reconnectStartedAt,
      buffered,
    };
  }
}
