import { useEffect, useState, type ReactNode } from "react";
import type { SongMetadataInput } from "../lib/nostr/domain/song";
import { useCurrentAccount } from "../lib/nostr/auth";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { SongFavoriteButton } from "./SongFavoriteButton";

type ObservedSong = {
  title: string;
  artist: string | null;
  album: string | null;
  mbid: string | null;
  startedAt: number;
  observedAt: number;
};

export function SongHistoryRow({ metadata, timestamp, stationName, children }: {
  metadata: SongMetadataInput;
  timestamp: number;
  stationName?: string;
  children?: ReactNode;
}) {
  const account = useCurrentAccount();
  const [showLogin, setShowLogin] = useState(false);
  const date = new Date(timestamp);

  return (
    <li className="min-w-0 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-bold">{metadata.song}</div>
          {metadata.artist && <div className="break-words text-sm">{metadata.artist}</div>}
          <div className="text-xs text-on-background/65">
            {stationName && <>{stationName} · </>}
            <time dateTime={date.toISOString()}>
              {date.toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </time>
          </div>
        </div>
        <SongFavoriteButton
          metadata={metadata}
          size="md"
          showLabel
          saveLabel="Save to Crate"
          onRequestLogin={() => setShowLogin(true)}
        />
        {children}
      </div>
      {showLogin && !account && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-on-background/25 pt-2">
          <span className="text-xs font-semibold">Sign in to save to your Crate</span>
          <LoginSessionButtons />
        </div>
      )}
    </li>
  );
}

function songMetadata(track: ObservedSong): SongMetadataInput {
  return {
    song: track.title,
    artist: track.artist ?? undefined,
    musicBrainz: track.mbid ? {
      id: track.mbid,
      title: track.title,
      artist: track.artist ?? "",
      release: track.album ?? undefined,
    } : undefined,
  };
}

export function StationTrackHistory({ address }: { address: string }) {
  const [result, setResult] = useState<{ address: string; songs?: ObservedSong[]; error?: boolean }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch("/api/station-tracks?" + new URLSearchParams({ address }), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Song history unavailable");
        const { tracks } = await response.json() as { tracks: ObservedSong[] };
        if (!controller.signal.aborted) setResult({ address, songs: tracks });
      } catch {
        if (!controller.signal.aborted) setResult({ address, error: true });
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [address, attempt]);

  const current = result?.address === address ? result : undefined;
  return (
    <section className="border-t-2 border-on-background bg-surface-container-low">
      <h2 className="px-3 py-2 font-headline text-base font-black uppercase">Recently heard on this station</h2>
      {current?.songs?.length ? (
        <ol className="divide-y divide-on-background/25 border-t border-on-background">
          {current.songs.map(track => (
            <SongHistoryRow
              key={JSON.stringify([track.startedAt, track.title, track.artist])}
              timestamp={track.observedAt * 1000}
              metadata={songMetadata(track)}
            />
          ))}
        </ol>
      ) : (
        <p className="px-3 pb-3 text-sm text-on-background/70">
          {current?.error ? (
            <>Song history is unavailable.{" "}
              <button type="button" className="font-bold underline" onClick={() => setAttempt(n => n + 1)}>
                Try again
              </button>
            </>
          ) : current ? "No songs observed yet." : "Loading song history…"}
        </p>
      )}
    </section>
  );
}
