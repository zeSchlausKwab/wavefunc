import { createFileRoute } from "@tanstack/react-router";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useMemo, useState } from "react";
import { map, of, scan, startWith } from "rxjs";
import { CrateSaveButton } from "../components/CrateSaveButton";
import { ShareSongDialog } from "../components/ShareSongDialog";
import { getAppDataRelayUrls } from "../config/nostr";
import { useProfile } from "../lib/nostr/auth";
import {
  parseSongEvent,
  SONG_KIND,
  type ParsedSong,
} from "../lib/nostr/domain";
import { useWavefuncNostr } from "../lib/nostr/runtime";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const Route = createFileRoute("/signals")({
  component: Signals,
});

// ─── Song signal row ──────────────────────────────────────────────────────────

interface SignalRowProps {
  song: ParsedSong;
}

function SignalRow({ song }: SignalRowProps) {
  const profile = useProfile(song.pubkey);
  const displayName =
    profile?.name || profile?.display_name || `${song.pubkey.slice(0, 8)}...`;
  const avatar = profile?.picture;
  const [embedOpen, setEmbedOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
    <div className="flex items-center gap-3 px-4 py-2.5 border-b-2 border-on-background/10 hover:bg-surface-container-high transition-colors group">
      {/* Thumbnail */}
      <div className="w-10 h-10 shrink-0 bg-on-background/10 border-2 border-on-background/20 flex items-center justify-center overflow-hidden">
        {song.thumb ? (
          <img
            src={song.thumb}
            alt={song.album || song.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="material-symbols-outlined text-[18px] text-on-background/30">music_note</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-[13px] uppercase tracking-tighter truncate leading-tight">
          {song.title || "UNKNOWN_TRACK"}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[10px] text-on-background/55 truncate leading-tight">
            {song.artist || "Unknown Artist"}
            {song.album && <span className="opacity-70"> · {song.album}</span>}
          </p>
          {song.genres.slice(0, 2).map((g) => (
            <span key={g} className="text-[8px] font-black uppercase tracking-widest text-on-background/35 border border-on-background/20 px-1 leading-tight hidden sm:inline">
              {g}
            </span>
          ))}
        </div>
      </div>

      {/* Year + Duration */}
      <div className="shrink-0 hidden sm:flex flex-col items-end gap-0.5">
        {song.releaseYear && (
          <span className="text-[10px] font-bold text-on-background/40 tabular-nums">{song.releaseYear}</span>
        )}
        {song.duration && (
          <span className="text-[9px] font-bold text-on-background/30 tabular-nums">{formatDuration(song.duration)}</span>
        )}
      </div>

      {/* Play media */}
      {song.audioUrl && (
        <button
          onClick={(e) => { e.stopPropagation(); setEmbedOpen((v) => !v); }}
          className={embedOpen ? "shrink-0 text-primary transition-colors" : "shrink-0 text-primary/60 hover:text-primary transition-colors"}
          title={embedOpen ? "Close player" : "Play"}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {embedOpen ? "stop_circle" : "play_circle"}
          </span>
        </button>
      )}

      {/* MusicBrainz link */}
      {song.mbid && (
        <a
          href={`https://musicbrainz.org/recording/${song.mbid}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-on-background/20 hover:text-on-background/60 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          title="View on MusicBrainz"
        >
          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
        </a>
      )}

      {/* Saver */}
      <div className="shrink-0 hidden md:flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-on-background/15 overflow-hidden flex items-center justify-center border border-on-background/20">
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="material-symbols-outlined text-[10px] text-on-background/40">person</span>
          )}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40 max-w-[80px] truncate">
          {displayName}
        </span>
      </div>

      {/* Save to Crate */}
      <CrateSaveButton song={song} size="sm" className="shrink-0" />

      {/* Share */}
      <button
        onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
        className="shrink-0 text-on-background/30 hover:text-on-background transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Share as Nostr note"
      >
        <span className="material-symbols-outlined text-[16px]">share</span>
      </button>
    </div>
    {shareOpen && (
      <ShareSongDialog song={song} onClose={() => setShareOpen(false)} />
    )}
    {embedOpen && song.audioUrl && (
      <div className="border-t-2 border-on-background/10 bg-black px-4 py-2 flex items-center gap-3">
        <video controls autoPlay src={song.audioUrl} className="flex-1 max-h-64 min-w-0" />
        <button
          onClick={() => setEmbedOpen(false)}
          className="shrink-0 text-white/40 hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined text-[12px]">close</span>
        </button>
      </div>
    )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Signals() {
  const { eventStore, relayPool } = useWavefuncNostr();
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);

  const filters: Filter[] = useMemo(
    () => [{ kinds: [SONG_KIND], limit: 100 }],
    [],
  );
  const filtersKey = JSON.stringify(filters);

  const eose =
    use$(
      () =>
        relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        ),
      [eventStore, filtersKey, relayPool, relaysKey],
    ) ?? false;

  const events =
    use$(
      () =>
        eventStore
          .timeline(filters)
          .pipe(map((timeline) => [...timeline])),
      [eventStore, filtersKey],
    ) ?? [];

  const songs: ParsedSong[] = useMemo(
    () =>
      events
        .map((e) => parseSongEvent(e))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
    [events],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter font-headline">SIGNALS</h1>
          <div className="h-2 flex-grow bg-on-background opacity-20" />
          {songs.length > 0 && (
            <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">{songs.length}_TRACKS</span>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/40">
          COMMUNITY_PICKS — SONGS_SAVED_BY_WAVEFUNC_USERS
        </p>
      </div>

      {/* Content */}
      {!eose && songs.length === 0 ? (
        <div className="border-4 border-on-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b-2 border-on-background/10">
              <div className="w-10 h-10 bg-on-background/10 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-on-background/10 w-2/3" />
                <div className="h-2 bg-on-background/10 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-background/20 block mb-4">signal_wifi_off</span>
          <div className="text-xl font-black uppercase tracking-tight mb-2 font-headline">NO_SIGNALS_YET</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
            BE_THE_FIRST_TO_SAVE_A_SONG
          </div>
        </div>
      ) : (
        <div className="border-4 border-on-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
          {songs.map((song) => (
            <SignalRow key={song.id || song.address} song={song} />
          ))}
        </div>
      )}
    </div>
  );
}
