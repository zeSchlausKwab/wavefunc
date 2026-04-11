/**
 * Live diagnostics panel for the playback pipeline. Shown inside the
 * expanded player sheet when `?debug=player` is in the URL, or when
 * the user has explicitly enabled diagnostics in settings (future).
 *
 * Exposes the inner state of the state machine, the candidate list
 * with failure history, reconnect timing, buffer level, and metadata
 * pipeline status. Invaluable for debugging user reports ("my station
 * stopped playing after 10 minutes and wouldn't come back").
 *
 * Also safe to ship in prod — nothing here is a security concern. The
 * URL flag just keeps the UI out of non-technical users' way.
 */

import { useEffect, useState } from "react";

import { useMetadataStore } from "../stores/metadataStore";
import { usePlayerStore } from "../stores/playerStore";
import {
  BUFFER_PATIENCE_MS,
  RECONNECT_BUDGET_MS,
  type PlayerState,
} from "../lib/player/state";

/** True if the URL has ?debug=player, or we're running in dev mode. */
export function useDiagnosticsEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      setEnabled(params.get("debug") === "player");
    };
    check();
    window.addEventListener("popstate", check);
    return () => window.removeEventListener("popstate", check);
  }, []);

  return enabled;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function fmtAge(timestamp: number | null | undefined, now: number): string {
  if (!timestamp) return "—";
  return fmtMs(now - timestamp);
}

function stateLabel(state: PlayerState): string {
  return state.kind.toUpperCase();
}

function stateDetail(state: PlayerState, now: number): string {
  switch (state.kind) {
    case "idle":
      return "—";
    case "loading":
      return `attempt ${state.attempt}/${state.candidateCount}, ${fmtMs(now - state.startedAt)} elapsed`;
    case "playing":
      return `for ${fmtMs(now - state.since)}`;
    case "buffering":
      return `stalled ${fmtMs(now - state.since)} (patience ${fmtMs(BUFFER_PATIENCE_MS)})`;
    case "reconnecting": {
      const untilNext = Math.max(0, state.nextAttemptAt - now);
      const totalElapsed = now - state.startedAt;
      const budgetLeft = Math.max(0, RECONNECT_BUDGET_MS - totalElapsed);
      return `attempt ${state.attempt}, next in ${fmtMs(untilNext)}, budget ${fmtMs(budgetLeft)}`;
    }
    case "failed":
      return `${state.reason}: ${state.message}`;
    case "paused":
      return "user-paused";
  }
}

export function PlayerDiagnostics() {
  const state = usePlayerStore((s) => s.state);
  const supervisor = usePlayerStore((s) => s.supervisor);
  const audioElement = usePlayerStore((s) => s.audioElement);

  const metadataStatus = useMetadataStore((s) => s.status);
  const metadataError = useMetadataStore((s) => s.lastError);
  const metadataFetchedAt = useMetadataStore((s) => s.lastFetchAt);
  const currentMetadata = useMetadataStore((s) => s.currentMetadata);

  // Tick every 500ms so countdowns / elapsed times update live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const diag = supervisor?.getDiagnostics();
  const buffered = diag?.buffered ?? 0;

  return (
    <div className="px-4 py-3 border-y-2 border-on-background/10 text-[10px] font-mono">
      <p className="font-black uppercase tracking-widest text-primary mb-2 text-[9px]">
        PLAYER_DIAGNOSTICS
      </p>

      <Row label="state">
        <span className="font-bold">{stateLabel(state)}</span>{" "}
        <span className="opacity-60">{stateDetail(state, now)}</span>
      </Row>

      <Row label="audio">
        {audioElement ? (
          <>
            readyState={audioElement.readyState}{" "}
            buffered={buffered.toFixed(1)}s{" "}
            paused={String(audioElement.paused)}
          </>
        ) : (
          "—"
        )}
      </Row>

      <Row label="reconnect">
        {diag?.reconnectStartedAt ? (
          <>
            attempt {diag.reconnectAttempt}, started{" "}
            {fmtAge(diag.reconnectStartedAt, now)} ago
          </>
        ) : (
          "—"
        )}
      </Row>

      <Row label="metadata">
        <span
          className={
            metadataStatus === "error"
              ? "text-destructive"
              : metadataStatus === "fetching"
              ? "text-secondary-fixed-dim"
              : ""
          }
        >
          {metadataStatus}
        </span>
        {metadataError && (
          <>
            {" "}
            <span className="opacity-60">({metadataError})</span>
          </>
        )}
        {metadataFetchedAt && (
          <>
            {" "}
            <span className="opacity-60">
              last {fmtAge(metadataFetchedAt, now)} ago
            </span>
          </>
        )}
        {currentMetadata?.song && (
          <>
            {" "}
            <span className="opacity-60">
              → {currentMetadata.song}
              {currentMetadata.artist && ` / ${currentMetadata.artist}`}
            </span>
          </>
        )}
      </Row>

      {diag && diag.candidates.length > 0 && (
        <div className="mt-2">
          <p className="font-bold uppercase tracking-wider opacity-60 mb-1">
            candidates ({diag.candidates.length})
          </p>
          <ul className="space-y-0.5">
            {diag.candidates.map((c, i) => (
              <li key={c.url} className="truncate">
                <span className="opacity-40">{i + 1}.</span>{" "}
                <span className="opacity-80">{truncate(c.url, 50)}</span>
                {c.failure && (
                  <span
                    className={
                      c.failure.reason === "fatal"
                        ? "text-destructive"
                        : "text-secondary-fixed-dim"
                    }
                  >
                    {" "}
                    [{c.failure.reason}: {c.failure.message}{" "}
                    <span className="opacity-60">
                      {fmtAge(c.failure.at, now)} ago
                    </span>
                    ]
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 leading-tight">
      <span className="opacity-40 uppercase tracking-wider w-20 shrink-0">
        {label}
      </span>
      <span className="flex-1 min-w-0 truncate">{children}</span>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
