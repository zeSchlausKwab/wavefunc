import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSubscribe, useProfileValue } from "@nostr-dev-kit/react";
import { NDKSong } from "../lib/NDKSong";
import { CrateSaveButton } from "../components/CrateSaveButton";
import { getAppDataSubscriptionOptions } from "../config/nostr";

export const Route = createFileRoute("/signals")({
  component: Signals,
});

// ─── Song signal row ──────────────────────────────────────────────────────────

interface SignalRowProps {
  song: NDKSong;
}

function SignalRow({ song }: SignalRowProps) {
  const profile = useProfileValue(song.pubkey, { subOpts: { closeOnEose: true } });
  const displayName = profile?.name || profile?.displayName || `${song.pubkey.slice(0, 8)}...`;
  const avatar = profile?.image || profile?.picture;

  return (
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
        <p className="text-[10px] text-on-background/55 truncate leading-tight">
          {song.artist || "Unknown Artist"}
          {song.album && <span className="opacity-70"> · {song.album}</span>}
        </p>
      </div>

      {/* Year */}
      {song.releaseYear && (
        <span className="shrink-0 text-[10px] font-bold text-on-background/40 tabular-nums hidden sm:block">
          {song.releaseYear}
        </span>
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
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Signals() {
  const { events, eose } = useSubscribe(
    [{ kinds: [31337], limit: 100 }],
    getAppDataSubscriptionOptions({ closeOnEose: false })
  );

  const songs = useMemo(
    () =>
      events
        .map((e) => NDKSong.from(e))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
    [events]
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
