import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSubscribe, useNDK } from "@nostr-dev-kit/react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useSongFavorites } from "../lib/hooks/useSongFavorites";
import { NDKSong } from "../lib/NDKSong";
import { NDKWFSongList } from "../lib/NDKWFSongList";
import { addressesToParameterizedFilters, getAppDataSubscriptionOptions } from "../config/nostr";
import { cn } from "@/lib/utils";
import { getMetadataClient, type YouTubeResult, type DownloadFormat } from "../ctxcn/WavefuncMetadataServerClient";

const VIDEO_FORMATS: { label: string; format: DownloadFormat; icon: string; hint: string }[] = [
  { label: "360p", format: "360p", icon: "video_file", hint: "WebM ≈10–30 MB" },
  { label: "480p", format: "480p", icon: "video_file", hint: "WebM ≈20–60 MB" },
  { label: "720p", format: "720p", icon: "video_file", hint: "MP4 ≈80–200 MB" },
];
import { useUIStore } from "../stores/uiStore";
import { YoutubeEmbed } from "../components/YoutubeEmbed";

const BLOSSOM_SERVERS = [
  { label: "blossom.band", url: "https://blossom.band" },
  { label: "cdn.hzrd149.com", url: "https://cdn.hzrd149.com" },
  { label: "files.v0l.io", url: "https://files.v0l.io" },
];

export const Route = createFileRoute("/crate")({
  component: Crate,
});

// ─── Song resolution ──────────────────────────────────────────────────────────

function useSongsFromList(list: NDKWFSongList | null) {
  const addresses = list?.getSongs() ?? [];
  const filters = useMemo(
    () => addressesToParameterizedFilters(31337, addresses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(addresses)]
  );
  const { events, eose } = useSubscribe(filters, getAppDataSubscriptionOptions());
  const songs = useMemo(() => events.map((e) => NDKSong.from(e)), [events]);
  return { songs, isLoading: !eose };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── YouTube audio panel ─────────────────────────────────────────────────────

interface YouTubeAudioPanelProps {
  song: NDKSong;
  onClose: () => void;
}

function YouTubeAudioPanel({ song, onClose }: YouTubeAudioPanelProps) {
  const { isLoggedIn } = useSongFavorites();
  const pulseLogin = useUIStore((s) => s.pulseLogin);
  const { ndk } = useNDK();
  const [phase, setPhase] = useState<"searching" | "results" | "downloading" | "uploading" | "error">("searching");
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [blossomUrl, setBlossomUrl] = useState(BLOSSOM_SERVERS[0]!.url);
  const [customBlossom, setCustomBlossom] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const effectiveBlossomUrl = showCustom ? customBlossom : blossomUrl;

  useEffect(() => {
    if (!isLoggedIn) { pulseLogin(); onClose(); return; }
    const query = [song.title, song.artist].filter(Boolean).join(" ");
    getMetadataClient()
      .SearchYouTube(query, 5)
      .then((out) => { setResults(out.results); setPhase("results"); })
      .catch((err) => { setErrorMsg(err.message ?? "Search failed"); setPhase("error"); });
  }, []);

  const handleDownload = async (result: YouTubeResult, format: DownloadFormat) => {
    if (!isLoggedIn) { pulseLogin(); return; }
    if (!ndk?.signer) { setErrorMsg("No signer available — connect your wallet first"); setPhase("error"); return; }

    setDownloadingId(result.videoId);
    setProgressMsg(null);
    setPhase("downloading");

    try {
      // Step 1: server downloads the file and returns hash
      const { tempId, sha256 } = await getMetadataClient().PrepareDownload(
        result.videoId,
        format,
        (p) => setProgressMsg(p.message ?? null)
      );

      // Step 2: client signs BUD-01 kind 24242 auth event
      setPhase("uploading");
      setProgressMsg("Waiting for signature...");
      const now = Math.floor(Date.now() / 1000);
      const authEvent = new NDKEvent(ndk);
      authEvent.kind = 24242;
      authEvent.content = `Upload ${format}`;
      authEvent.created_at = now;
      authEvent.tags = [
        ["t", "upload"],
        ["x", sha256],
        ["expiration", String(now + 600)],
      ];
      await authEvent.sign();
      const signedEventJson = JSON.stringify(authEvent.rawEvent());

      // Step 3: server uploads using our signed auth
      setProgressMsg("Uploading to Blossom...");
      const { url } = await getMetadataClient().UploadToBlossom(
        tempId,
        effectiveBlossomUrl,
        signedEventJson,
        (p) => setProgressMsg(p.message ?? null)
      );

      await song.attachAudioAndPublish(url, result.videoId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message ?? "Download failed");
      setPhase("error");
      setDownloadingId(null);
    }
  };

  if (watchingId) {
    return <YoutubeEmbed videoId={watchingId} onClose={() => setWatchingId(null)} />;
  }

  return (
    <div className="border-t-2 border-on-background/10 bg-surface-container-high px-4 py-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-widest text-on-background/50 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[12px]">smart_display</span>
          {phase === "searching" && "SEARCHING..."}
          {phase === "results" && `RESULTS_FOR: ${[song.title, song.artist].filter(Boolean).join(" — ")}`}
          {(phase === "downloading" || phase === "uploading") && "SAVING_TO_BLOSSOM..."}
          {phase === "error" && "ERROR"}
        </span>
        <button onClick={onClose} className="text-on-background/30 hover:text-on-background transition-colors">
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>

      {/* Blossom server picker (only in results phase) */}
      {phase === "results" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40 shrink-0">BLOSSOM:</span>
          {BLOSSOM_SERVERS.map((s) => (
            <button
              key={s.url}
              onClick={() => { setBlossomUrl(s.url); setShowCustom(false); }}
              className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors",
                !showCustom && blossomUrl === s.url
                  ? "border-on-background bg-on-background text-surface"
                  : "border-on-background/20 hover:border-on-background/60"
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors",
              showCustom
                ? "border-on-background bg-on-background text-surface"
                : "border-on-background/20 hover:border-on-background/60"
            )}
          >
            CUSTOM
          </button>
          {showCustom && (
            <input
              type="url"
              value={customBlossom}
              onChange={(e) => setCustomBlossom(e.target.value)}
              placeholder="https://your-blossom-server.com"
              className="flex-1 min-w-[200px] bg-transparent text-[9px] font-mono border-b border-on-background/40 outline-none py-0.5 placeholder:text-on-background/25"
            />
          )}
        </div>
      )}

      {phase === "searching" && (
        <div className="flex items-center gap-2 py-3 text-on-background/40">
          <span className="material-symbols-outlined text-[16px]" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">FETCHING_RESULTS...</span>
        </div>
      )}

      {phase === "results" && results.length === 0 && (
        <p className="text-[10px] text-on-background/40 uppercase tracking-widest py-3">NO_RESULTS_FOUND</p>
      )}

      {phase === "results" && results.length > 0 && (
        <div className="space-y-1">
          {results.map((r) => {
            const isDownloading = downloadingId === r.videoId;
            return (
              <div key={r.videoId} className="flex items-center gap-2.5 px-2 py-1.5 border border-transparent hover:border-on-background/20">
                {r.thumbnailUrl && (
                  <img src={r.thumbnailUrl} alt="" className="w-12 h-9 object-cover shrink-0 bg-on-background/10"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-tight truncate">{r.title}</p>
                  <p className="text-[9px] text-on-background/50 truncate">
                    {r.channel}
                    {r.duration && <span className="ml-2 tabular-nums">{formatDuration(r.duration)}</span>}
                  </p>
                </div>
                <button
                  onClick={() => setWatchingId(r.videoId)}
                  disabled={downloadingId !== null}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-on-background/20 hover:bg-on-background hover:text-surface hover:border-on-background transition-colors disabled:opacity-40"
                  title="Preview"
                >
                  <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                  PREVIEW
                </button>
                <button
                  onClick={() => handleDownload(r, "audio")}
                  disabled={downloadingId !== null}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-on-background/20 hover:bg-on-background hover:text-surface hover:border-on-background transition-colors disabled:opacity-40"
                  title="Save audio to Blossom"
                >
                  <span className="material-symbols-outlined text-[12px]"
                    style={isDownloading ? { animation: "spin 0.8s linear infinite" } : {}}>
                    {isDownloading ? "sync" : "audio_file"}
                  </span>
                  AUDIO
                </button>
                {VIDEO_FORMATS.map(({ label, format, hint }) => (
                  <button
                    key={format}
                    onClick={() => handleDownload(r, format)}
                    disabled={downloadingId !== null}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-on-background/20 hover:bg-on-background hover:text-surface hover:border-on-background transition-colors disabled:opacity-40"
                    title={hint}
                  >
                    <span className="material-symbols-outlined text-[12px]">video_file</span>
                    {label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {(phase === "downloading" || phase === "uploading") && (
        <div className="flex items-start gap-2 py-3 text-on-background/60">
          <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest">
              {phase === "uploading" ? "UPLOADING_TO_BLOSSOM..." : "DOWNLOADING..."}
            </p>
            <p className="text-[9px] text-on-background/50 mt-0.5 truncate font-mono">{progressMsg ?? "Starting..."}</p>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex items-center gap-2 py-2 text-destructive">
          <span className="material-symbols-outlined text-[14px]">error</span>
          <p className="text-[10px] font-bold uppercase tracking-tight truncate">{errorMsg}</p>
          <button
            onClick={() => { setPhase("results"); setErrorMsg(null); setDownloadingId(null); }}
            className="ml-auto shrink-0 text-[9px] font-black uppercase tracking-widest border border-current px-2 py-0.5 hover:bg-destructive hover:text-white transition-colors"
          >
            RETRY
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Song row ─────────────────────────────────────────────────────────────────

interface SongRowProps {
  song: NDKSong;
  sourceList: NDKWFSongList;
  otherLists: NDKWFSongList[];
  onMove: (songAddress: string, fromListId: string, toListId: string) => Promise<void>;
  onRemove: (songAddress: string, listId: string) => Promise<void>;
}

function SongRow({ song, sourceList, otherLists, onMove, onRemove }: SongRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ytPanelOpen, setYtPanelOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMove = async (toListId: string) => {
    if (!sourceList.listId) return;
    setMenuOpen(false);
    setBusy(true);
    await onMove(song.address, sourceList.listId, toListId);
    setBusy(false);
  };

  const handleRemove = async () => {
    if (!sourceList.listId) return;
    setMenuOpen(false);
    setBusy(true);
    await onRemove(song.address, sourceList.listId);
    setBusy(false);
  };

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

      {/* Play audio */}
      {song.audioUrl && (
        <button
          onClick={(e) => { e.stopPropagation(); setEmbedOpen((v) => !v); }}
          className={cn("shrink-0 transition-colors", embedOpen ? "text-primary" : "text-primary/60 hover:text-primary")}
          title={embedOpen ? "Close player" : "Play audio"}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {embedOpen ? "stop_circle" : "play_circle"}
          </span>
        </button>
      )}

      {/* Actions menu */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          className="w-7 h-7 flex items-center justify-center text-on-background/30 hover:text-on-background transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
          title="Song options"
        >
          {busy ? (
            <span className="material-symbols-outlined text-[16px]" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">more_horiz</span>
          )}
        </button>

        {menuOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            {/* Menu */}
            <div className="absolute right-0 top-full mt-1 z-20 bg-background border-2 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] min-w-[160px]">
              {otherLists.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-on-background/40 border-b border-on-background/10">
                    Move to
                  </div>
                  {otherLists.map((list) => (
                    <button
                      key={list.listId}
                      onClick={() => handleMove(list.listId!)}
                      className="w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-tight hover:bg-on-background hover:text-surface transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[14px]">drive_file_move</span>
                      {list.name || "Unnamed list"}
                    </button>
                  ))}
                  <div className="border-t border-on-background/10" />
                </>
              )}
              <button
                onClick={() => { setMenuOpen(false); setYtPanelOpen((v) => !v); }}
                className="w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-tight hover:bg-on-background hover:text-surface transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {song.audioUrl ? "check_circle" : "download"}
                </span>
                {song.audioUrl ? "AUDIO_ATTACHED" : "GET_AUDIO"}
              </button>
              <div className="border-t border-on-background/10" />
              <button
                onClick={handleRemove}
                className="w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-tight hover:bg-destructive hover:text-white transition-colors flex items-center gap-2 text-destructive"
              >
                <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    {ytPanelOpen && (
      <YouTubeAudioPanel song={song} onClose={() => setYtPanelOpen(false)} />
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

// ─── List panel ───────────────────────────────────────────────────────────────

interface SongListPanelProps {
  list: NDKWFSongList;
  allLists: NDKWFSongList[];
  onMove: (songAddress: string, fromListId: string, toListId: string) => Promise<void>;
  onRemove: (songAddress: string, listId: string) => Promise<void>;
}

function SongListPanel({ list, allLists, onMove, onRemove }: SongListPanelProps) {
  const { songs, isLoading } = useSongsFromList(list);
  const count = list.getSongCount();
  const otherLists = allLists.filter((l) => l.listId !== list.listId);

  return (
    <div className="border-4 border-on-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
      <div className="flex items-center justify-between px-4 py-3 bg-on-background text-surface">
        <div>
          <h2 className="font-black text-base uppercase tracking-tighter font-headline leading-none">
            {list.name || "UNNAMED_LIST"}
          </h2>
          {list.description && (
            <p className="text-[10px] opacity-60 mt-0.5">{list.description}</p>
          )}
        </div>
        <span className="text-[10px] font-bold opacity-50 tabular-nums">{count}_TRACKS</span>
      </div>

      {isLoading && count > 0 ? (
        <div>
          {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b-2 border-on-background/10 animate-pulse">
              <div className="w-10 h-10 shrink-0 bg-on-background/10" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-on-background/10 w-2/3" />
                <div className="h-2 bg-on-background/10 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : songs.length > 0 ? (
        <div>
          {songs.map((song) => (
            <SongRow
              key={song.id || song.songId}
              song={song}
              sourceList={list}
              otherLists={otherLists}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : count === 0 ? (
        <div className="px-4 py-8 text-center">
          <span className="material-symbols-outlined text-4xl text-on-background/20 block mb-2">music_off</span>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/40">NO_TRACKS_YET</p>
          <p className="text-[9px] text-on-background/30 mt-1">Like a song while listening to add it here</p>
        </div>
      ) : (
        <div className="px-4 py-4 text-[10px] text-on-background/40 uppercase tracking-widest text-center">
          LOADING_TRACKS...
        </div>
      )}
    </div>
  );
}

// ─── Inline create form ───────────────────────────────────────────────────────

function CreateListForm({ onCreate, onCancel }: { onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onCreate(name.trim());
    setBusy(false);
  };

  return (
    <form onSubmit={handleSubmit} className="border-4 border-on-background bg-surface-container-high p-4 flex items-center gap-3 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="LIST_NAME..."
        maxLength={60}
        className="flex-1 bg-transparent font-black uppercase tracking-tighter text-sm outline-none border-b-2 border-on-background py-1 placeholder:text-on-background/25 font-headline"
      />
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="border-2 border-on-background px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-on-background hover:text-surface transition-colors disabled:opacity-40"
      >
        {busy ? "CREATING..." : "CREATE"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="border-2 border-on-background/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:border-on-background transition-colors"
      >
        CANCEL
      </button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Crate() {
  const { songLists, isLoggedIn, isLoading, createList, moveSong, removeSongFromList } = useSongFavorites();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const totalTracks = useMemo(
    () => songLists.reduce((n, l) => n + l.getSongCount(), 0),
    [songLists]
  );

  const handleCreate = async (name: string) => {
    await createList(name);
    setShowCreateForm(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="space-y-6">
        <PageHeader totalTracks={0} />
        <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-background/20 block mb-4">lock</span>
          <div className="text-xl font-black uppercase tracking-tight mb-2 font-headline">AUTHENTICATION_REQUIRED</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">CONNECT_TO_ACCESS_YOUR_CRATE</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader totalTracks={0} />
        <div className="border-4 border-on-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] animate-pulse">
          <div className="h-12 bg-on-background/10" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b-2 border-on-background/10">
              <div className="w-10 h-10 bg-on-background/10 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-on-background/10 w-2/3" />
                <div className="h-2 bg-on-background/10 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <PageHeader
          totalTracks={totalTracks}
          showCreateForm={showCreateForm}
          onNewList={() => setShowCreateForm((v) => !v)}
        />
        {showCreateForm && (
          <CreateListForm onCreate={handleCreate} onCancel={() => setShowCreateForm(false)} />
        )}
      </div>

      {songLists.length === 0 && !showCreateForm ? (
        <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-background/20 block mb-4">album</span>
          <div className="text-xl font-black uppercase tracking-tight mb-2 font-headline">CRATE_IS_EMPTY</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 mb-2">
            LIKE_A_SONG_WHILE_LISTENING_TO_START_YOUR_COLLECTION
          </div>
          <div className="text-[9px] text-on-background/30">Tap ★ next to the now-playing track in the player bar</div>
        </div>
      ) : (
        songLists.map((list) => (
          <SongListPanel
            key={list.listId || list.pubkey}
            list={list}
            allLists={songLists}
            onMove={moveSong}
            onRemove={removeSongFromList}
          />
        ))
      )}
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────

function PageHeader({
  totalTracks,
  showCreateForm,
  onNewList,
}: {
  totalTracks: number;
  showCreateForm?: boolean;
  onNewList?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter font-headline">CRATE</h1>
        <div className={cn("h-2 flex-grow bg-on-background", totalTracks === 0 && "opacity-20")} />
        {totalTracks > 0 && (
          <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">{totalTracks}_TRACKS</span>
        )}
      </div>
      {onNewList && (
        <button
          onClick={onNewList}
          className={cn(
            "border-2 border-on-background px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5",
            showCreateForm
              ? "bg-on-background text-surface"
              : "bg-surface hover:bg-on-background hover:text-surface"
          )}
        >
          <span className="material-symbols-outlined text-[14px]">{showCreateForm ? "close" : "add"}</span>
          {showCreateForm ? "CANCEL" : "NEW_LIST"}
        </button>
      )}
    </div>
  );
}
