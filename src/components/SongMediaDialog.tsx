import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  getMetadataClient,
  type YouTubeResult,
} from "../ctxcn/WavefuncMetadataServerClient";
import { usePlatform } from "../lib/hooks/usePlatform";
import { useCurrentAccount } from "../lib/nostr/auth";
import {
  type ParsedSong,
  type SongMetadataInput,
} from "../lib/nostr/domain";
import { forgeAndFavoriteSong } from "../lib/nostr/forgeSong";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useSongFavorites } from "../lib/hooks/useSongFavorites";
import {
  createInstalledMediaAcquirer,
  mediaAcquisitionAvailability,
  mediaErrorMessage,
  type MediaFormat,
} from "../lib/mediaAcquisition";
import { useUIStore } from "../stores/uiStore";
import { cn } from "@/lib/utils";
import { ShareSongDialog } from "./ShareSongDialog";
import { YoutubeEmbed } from "./YoutubeEmbed";

export const DEFAULT_BLOSSOM_URL = "https://blossom.band";

const BLOSSOM_SERVERS = [
  { label: "BLOSSOM.BAND", url: DEFAULT_BLOSSOM_URL },
  { label: "HZRD149", url: "https://cdn.hzrd149.com" },
  { label: "V0L.IO", url: "https://files.v0l.io" },
] as const;

const VIDEO_FORMATS: { label: string; format: Exclude<MediaFormat, "audio"> }[] = [
  { label: "360P", format: "360p" },
  { label: "480P", format: "480p" },
  { label: "720P", format: "720p" },
];

type Phase =
  | "searching"
  | "results"
  | "downloading"
  | "authorizing"
  | "uploading"
  | "error";

interface SongMediaDialogProps {
  song?: ParsedSong;
  metadata?: SongMetadataInput;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function SongMediaDialog({ song, metadata, onClose }: SongMediaDialogProps) {
  const currentUser = useCurrentAccount();
  const pulseLogin = useUIStore((state) => state.pulseLogin);
  const { signer, signAndPublish } = useWavefuncNostr();
  const { addToDefaultList } = useSongFavorites();
  const platform = usePlatform();
  const acquisition = mediaAcquisitionAvailability(platform);

  const [phase, setPhase] = useState<Phase>("searching");
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"audio" | "video">("audio");
  const [videoFormat, setVideoFormat] = useState<Exclude<MediaFormat, "audio">>("360p");
  const [blossomUrl, setBlossomUrl] = useState(DEFAULT_BLOSSOM_URL);
  const [customBlossom, setCustomBlossom] = useState("");
  const [useCustomBlossom, setUseCustomBlossom] = useState(false);
  const [shareSong, setShareSong] = useState<ParsedSong | null>(null);

  const title = song?.title || metadata?.musicBrainz?.title || metadata?.song || "";
  const artist = song?.artist || metadata?.musicBrainz?.artist || metadata?.artist || "";
  const query = useMemo(() => [title, artist].filter(Boolean).join(" "), [artist, title]);
  const format: MediaFormat = mediaType === "audio" ? "audio" : videoFormat;
  const effectiveBlossomUrl = useCustomBlossom ? customBlossom.trim() : blossomUrl;

  const search = useCallback(async () => {
    if (!query) {
      setErrorMsg("No track metadata is available for this search.");
      setPhase("error");
      return;
    }

    setErrorMsg(null);
    setPhase("searching");
    try {
      const output = await getMetadataClient().SearchYouTube(query, 5);
      setResults(output.results);
      setPhase("results");
    } catch (error) {
      setErrorMsg(mediaErrorMessage(error, "YouTube search failed."));
      setPhase("error");
    }
  }, [query]);

  useEffect(() => {
    if (!currentUser) {
      pulseLogin();
      onClose();
      return;
    }
    void search();
    // Opening the dialog is the search trigger; parent callback identity is irrelevant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "downloading" && phase !== "uploading") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, phase]);

  const saveMedia = async (result: YouTubeResult) => {
    if (!signer || !currentUser) {
      pulseLogin();
      return;
    }
    if (acquisition.mode !== "local") {
      setErrorMsg(acquisition.reason);
      setPhase("error");
      return;
    }
    if (!effectiveBlossomUrl) {
      setErrorMsg("Choose a Blossom server before starting the transfer.");
      setPhase("error");
      return;
    }

    setActiveVideoId(result.videoId);
    setErrorMsg(null);
    setProgressMsg("Saving to Liked Songs…");
    setPhase("downloading");

    try {
      const persistedSong = await forgeAndFavoriteSong({
        song,
        metadata,
        videoId: result.videoId,
        favorite: async (address) => {
          await addToDefaultList(address);
        },
        acquireMedia: async () => {
          setProgressMsg("Starting local media engine…");
          const mediaAcquirer = await createInstalledMediaAcquirer();
          return mediaAcquirer.save({
            videoId: result.videoId,
            format,
            blossomUrl: effectiveBlossomUrl,
            signEvent: (template) => signer.signEvent(template),
            onProgress: (progress) => {
              setPhase(
                progress.stage === "uploading"
                  ? "uploading"
                  : progress.stage === "authorizing"
                    ? "authorizing"
                    : "downloading",
              );
              setProgressMsg(progress.message ?? null);
            },
          });
        },
        publish: (template) => signAndPublish(template),
      });
      setShareSong(persistedSong);
    } catch (error) {
      setErrorMsg(mediaErrorMessage(error, "Media download failed."));
      setActiveVideoId(null);
      setPhase("error");
    }
  };

  if (shareSong) {
    return <ShareSongDialog song={shareSong} onClose={onClose} />;
  }

  if (typeof document === "undefined") return null;

  const transferring =
    phase === "downloading" || phase === "authorizing" || phase === "uploading";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      <button
        type="button"
        aria-label="Close media forge"
        className="absolute inset-0 bg-background/85 backdrop-blur-sm"
        onClick={transferring ? undefined : onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Save song to Blossom"
        className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col border-4 border-on-background bg-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] sm:max-h-[calc(100dvh-2rem)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 bg-on-background px-4 py-3 text-surface">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[17px]">auto_fix_high</span>
              <h2 className="text-[12px] font-black uppercase tracking-widest">MEDIA_FORGE</h2>
            </div>
            <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-surface/55">
              {title || "UNKNOWN_TRACK"}{artist ? ` · ${artist}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={transferring}
            className="shrink-0 text-surface/55 transition-colors hover:text-surface disabled:opacity-30"
            title={transferring ? "Wait for the active transfer" : "Close"}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMediaType("audio")}
              disabled={transferring}
              className={cn(
                "flex min-h-12 items-center gap-2 border-2 px-3 text-left transition-colors",
                mediaType === "audio"
                  ? "border-on-background bg-on-background text-surface"
                  : "border-on-background/25 hover:border-on-background",
              )}
            >
              <span className="material-symbols-outlined text-[18px]">audio_file</span>
              <span>
                <span className="block text-[10px] font-black uppercase tracking-widest">AUDIO_ONLY</span>
                <span className="block text-[8px] font-bold uppercase opacity-55">SMALLER_FILE</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMediaType("video")}
              disabled={transferring}
              className={cn(
                "flex min-h-12 items-center gap-2 border-2 px-3 text-left transition-colors",
                mediaType === "video"
                  ? "border-on-background bg-on-background text-surface"
                  : "border-on-background/25 hover:border-on-background",
              )}
            >
              <span className="material-symbols-outlined text-[18px]">video_file</span>
              <span>
                <span className="block text-[10px] font-black uppercase tracking-widest">VIDEO</span>
                <span className="block text-[8px] font-bold uppercase opacity-55">PICTURE_+_SOUND</span>
              </span>
            </button>
          </div>

          {mediaType === "video" && (
            <div>
              <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-on-background/45">VIDEO_QUALITY</p>
              <div className="grid grid-cols-3 gap-2">
                {VIDEO_FORMATS.map((choice) => (
                  <button
                    key={choice.format}
                    type="button"
                    onClick={() => setVideoFormat(choice.format)}
                    disabled={transferring}
                    className={cn(
                      "border-2 px-2 py-2 text-[10px] font-black uppercase tracking-widest transition-colors",
                      videoFormat === choice.format
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-on-background/25 hover:border-on-background",
                    )}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-on-background/45">BLOSSOM_DESTINATION</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-primary">DEFAULT: BLOSSOM.BAND</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BLOSSOM_SERVERS.map((server) => (
                <button
                  key={server.url}
                  type="button"
                  onClick={() => {
                    setBlossomUrl(server.url);
                    setUseCustomBlossom(false);
                  }}
                  disabled={transferring}
                  className={cn(
                    "border px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors",
                    !useCustomBlossom && blossomUrl === server.url
                      ? "border-on-background bg-on-background text-surface"
                      : "border-on-background/25 hover:border-on-background",
                  )}
                >
                  {server.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUseCustomBlossom(true)}
                disabled={transferring}
                className={cn(
                  "border px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors",
                  useCustomBlossom
                    ? "border-on-background bg-on-background text-surface"
                    : "border-on-background/25 hover:border-on-background",
                )}
              >
                CUSTOM
              </button>
            </div>
            {useCustomBlossom && (
              <input
                type="url"
                value={customBlossom}
                onChange={(event) => setCustomBlossom(event.target.value)}
                placeholder="https://your-blossom-server.example"
                disabled={transferring}
                className="mt-2 w-full border-2 border-on-background/25 bg-transparent px-3 py-2 font-mono text-[10px] outline-none placeholder:text-on-background/25 focus:border-on-background"
              />
            )}
          </div>

          <div className="border-y-2 border-on-background/15 py-2">
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-on-background/45">
              SEARCH VIA CONTEXTVM · DOWNLOAD ON THIS DEVICE · UPLOAD DIRECT TO BLOSSOM
            </p>
          </div>

          {acquisition.mode === "app-required" && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-2 border-primary/50 bg-primary/5 p-3">
              <p className="text-[10px] font-bold uppercase leading-relaxed text-on-background/70">
                Local media downloads require WaveFunc for Android or desktop.
              </p>
              <a
                href="/apps"
                className="border-2 border-on-background bg-on-background px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-surface"
              >
                GET_APP
              </a>
            </div>
          )}

          {phase === "searching" && (
            <div className="flex items-center gap-2 py-6 text-on-background/45">
              <span className="material-symbols-outlined text-[18px]" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
              <span className="text-[10px] font-black uppercase tracking-widest">SCANNING_RESULTS...</span>
            </div>
          )}

          {watchingId && (
            <YoutubeEmbed videoId={watchingId} onClose={() => setWatchingId(null)} />
          )}

          {phase === "results" && results.length === 0 && (
            <p className="py-6 text-center text-[10px] font-bold uppercase tracking-widest text-on-background/40">NO_RESULTS_FOUND</p>
          )}

          {phase === "results" && results.length > 0 && (
            <div className="space-y-2">
              {results.map((result) => (
                <article
                  key={result.videoId}
                  className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 border-2 border-on-background/15 p-2 sm:grid-cols-[80px_minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="row-span-2 aspect-video overflow-hidden bg-on-background/10 sm:row-span-1">
                    {result.thumbnailUrl ? (
                      <img
                        src={result.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <span className="material-symbols-outlined flex h-full items-center justify-center text-on-background/25">smart_display</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black uppercase tracking-tight">{result.title}</p>
                    <p className="truncate text-[9px] text-on-background/50">
                      {result.channel}
                      {result.duration ? <span className="ml-2 tabular-nums">{formatDuration(result.duration)}</span> : null}
                    </p>
                  </div>
                  <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-3 sm:row-start-1 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setWatchingId(result.videoId)}
                      className="border border-on-background/25 px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors hover:border-on-background hover:bg-on-background hover:text-surface"
                    >
                      PREVIEW
                    </button>
                    {acquisition.mode === "local" && (
                      <button
                        type="button"
                        onClick={() => void saveMedia(result)}
                        disabled={!effectiveBlossomUrl}
                        className="flex items-center gap-1 border-2 border-primary bg-primary px-2 py-1 text-[9px] font-black uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-35"
                      >
                        <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                        FORGE_{format === "audio" ? "AUDIO" : format.toUpperCase()}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {transferring && (
            <div className="border-2 border-on-background bg-on-background p-3 text-surface">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined shrink-0 text-[18px]" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest">
                    {phase === "uploading"
                      ? "UPLOADING_TO_BLOSSOM..."
                      : phase === "authorizing"
                        ? "WAITING_FOR_SIGNER_APPROVAL..."
                        : "DOWNLOADING_ON_DEVICE..."}
                  </p>
                  <p className="mt-1 break-words font-mono text-[9px] leading-relaxed text-surface/60">
                    {progressMsg || `Processing ${activeVideoId || "selection"}…`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="border-2 border-destructive bg-destructive/5 p-3 text-destructive">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined shrink-0 text-[17px]">error</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest">TRANSFER_ABORTED</p>
                  <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">
                    {errorMsg}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setPhase(results.length > 0 ? "results" : "searching");
                    if (results.length === 0) void search();
                  }}
                  className="border border-destructive px-3 py-1 text-[9px] font-black uppercase tracking-widest hover:bg-destructive hover:text-white"
                >
                  RETRY
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
