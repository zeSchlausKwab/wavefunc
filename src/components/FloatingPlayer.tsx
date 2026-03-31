import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { usePlayerStore } from "../stores/playerStore";
import { useSearchStore } from "../stores/searchStore";
import { useUIStore } from "../stores/uiStore";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { NDKStation } from "../lib/NDKStation";
import Hls from "hls.js";
import { Skeleton } from "@/components/ui/skeleton";
import { HistorySheet } from "./HistorySheet";
import { ZapDialog } from "./ZapDialog";
import { StationDetail } from "./StationDetail";
import { cn } from "@/lib/utils";
import { SmallLogo } from "./SmallLogo";
import { NavigationItems } from "./NavigationItems";
import { UnifiedSearchInput } from "./UnifiedSearchInput";
import { LoginSessionButtons } from "./LoginSessionButtom";

// ─── Snap levels ──────────────────────────────────────────────────────────────

const PEEK_VH = 45;
const EXPANDED_VH = 82;
const SNAP_THRESHOLD_VH = (PEEK_VH + EXPANDED_VH) / 2;

function clampPanelVh(vh: number) {
  return Math.min(EXPANDED_VH, Math.max(PEEK_VH, vh));
}

// ─── Social bar ───────────────────────────────────────────────────────────────

function PlayerSocialBar({ station }: { station: NDKStation }) {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const [showZapDialog, setShowZapDialog] = useState(false);
  const { reactions, zaps, comments, userHasReacted, userHasZapped, userHasCommented } =
    useSocialInteractions(station);

  const handleLike = async () => {
    if (!currentUser || !ndk) return;
    await station.react("❤️");
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/station/${station.naddr}`);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={handleLike}
          className="flex items-center gap-0.5 hover:text-primary transition-colors"
          title={`Like${reactions > 0 ? ` (${reactions})` : ""}`}
        >
          <span
            className={cn("material-symbols-outlined text-[14px]", userHasReacted && "text-primary")}
            style={userHasReacted ? { fontVariationSettings: "'FILL' 1" } : {}}
          >
            favorite
          </span>
          {reactions > 0 && <span className="text-[9px] font-bold">{reactions}</span>}
        </button>

        <button
          onClick={() => setShowZapDialog(true)}
          className="flex items-center gap-0.5 hover:text-secondary-fixed-dim transition-colors"
          title={`Zap${zaps > 0 ? ` (${zaps})` : ""}`}
        >
          <span className={cn("material-symbols-outlined text-[14px]", userHasZapped && "text-yellow-500")}>
            bolt
          </span>
          {zaps > 0 && <span className="text-[9px] font-bold">{zaps}</span>}
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-0.5 hover:text-primary transition-colors"
          title="Share"
        >
          <span className="material-symbols-outlined text-[14px]">share</span>
        </button>
      </div>

      <ZapDialog
        station={station}
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        onZap={async (amount) => { console.log(`Zapping ${amount} sats to station:`, station.name); }}
      />
    </>
  );
}

// ─── FloatingPlayer ───────────────────────────────────────────────────────────

interface FloatingPlayerProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

export function FloatingPlayer({ searchInput, setSearchInput, onSearch }: FloatingPlayerProps) {
  // ── Player store ──
  const {
    currentStation,
    currentMetadata,
    isPlaying,
    isLoading,
    error,
    volume,
    isMuted,
    pause,
    resume,
    stop,
    setVolume,
    toggleMute,
    setAudioElement,
    setIsPlaying,
    setIsLoading,
    setError,
  } = usePlayerStore();

  const { triggerMusicBrainzSearch } = useSearchStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // ── Sheet state (global) ──
  const {
    sheetOpen,
    sheetMode,
    sheetStation,
    sheetSnap,
    sheetFocusComment,
    openNavSheet,
    openStationSheet,
    closeSheet,
    setSheetSnap,
    clearCommentFocus,
  } = useUIStore();

  // ── Drag state (local, transient) ──
  const [dragHeightVh, setDragHeightVh] = useState<number | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragStartHeightRef = useRef<number>(PEEK_VH);
  const draggedRef = useRef(false);

  const baseHeightVh = sheetSnap === "expanded" ? EXPANDED_VH : PEEK_VH;
  const panelHeightVh = dragHeightVh ?? baseHeightVh;

  const handleDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragStartYRef.current = event.clientY;
    dragStartHeightRef.current = panelHeightVh;
    draggedRef.current = false;
    setDragHeightVh(panelHeightVh);
    dragHeightRef.current = panelHeightVh;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (dragStartYRef.current == null) return;
      const deltaY = dragStartYRef.current - moveEvent.clientY;
      if (Math.abs(deltaY) > 4) draggedRef.current = true;
      const deltaVh = (deltaY / window.innerHeight) * 100;
      const nextHeight = clampPanelVh(dragStartHeightRef.current + deltaVh);
      dragHeightRef.current = nextHeight;
      setDragHeightVh(nextHeight);
    };

    const handlePointerUp = () => {
      const finalHeight = dragHeightRef.current ?? baseHeightVh;
      setSheetSnap(finalHeight >= SNAP_THRESHOLD_VH ? "expanded" : "peek");
      setDragHeightVh(null);
      dragHeightRef.current = null;
      dragStartYRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleGrabberClick = () => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    if (sheetSnap === "expanded") {
      setSheetSnap("peek");
    } else {
      closeSheet();
      setDragHeightVh(null);
      dragHeightRef.current = null;
    }
  };

  const handleGrabberKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleGrabberClick();
    }
  };

  // ── Audio setup ──
  const handleSearchMetadata = () => {
    if (!currentMetadata?.song) return;
    const query = currentMetadata.artist
      ? `${currentMetadata.song} ${currentMetadata.artist}`
      : currentMetadata.song;
    triggerMusicBrainzSearch(query);
  };

  useEffect(() => {
    if (audioRef.current) setAudioElement(audioRef.current);
    return () => {
      setAudioElement(null);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [setAudioElement]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay      = () => setIsPlaying(true);
    const handlePause     = () => setIsPlaying(false);
    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay   = () => setIsLoading(false);
    const handleWaiting   = () => setIsLoading(true);
    const handlePlaying   = () => setIsLoading(false);
    const handleStalled   = () => console.warn("Audio: stalled");
    const handleSuspend   = () => console.log("Audio: suspend");
    const handleError     = (e: Event) => {
      const audioError = (e.target as HTMLAudioElement).error;
      setError(audioError ? `Error ${audioError.code}: ${audioError.message}` : "Failed to load audio");
      setIsLoading(false);
    };

    audio.addEventListener("play",      handlePlay);
    audio.addEventListener("pause",     handlePause);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay",   handleCanPlay);
    audio.addEventListener("error",     handleError);
    audio.addEventListener("waiting",   handleWaiting);
    audio.addEventListener("playing",   handlePlaying);
    audio.addEventListener("stalled",   handleStalled);
    audio.addEventListener("suspend",   handleSuspend);

    return () => {
      audio.removeEventListener("play",      handlePlay);
      audio.removeEventListener("pause",     handlePause);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay",   handleCanPlay);
      audio.removeEventListener("error",     handleError);
      audio.removeEventListener("waiting",   handleWaiting);
      audio.removeEventListener("playing",   handlePlaying);
      audio.removeEventListener("stalled",   handleStalled);
      audio.removeEventListener("suspend",   handleSuspend);
    };
  }, [setIsPlaying, setIsLoading, setError]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />

      {/* ── Unified mobile panel ── */}
      <div
        className={cn(
          "md:hidden fixed left-0 right-0 bottom-0 z-[70] bg-background border-t-4 border-on-background overflow-hidden flex flex-col",
          !sheetOpen && "shadow-[0_-8px_0px_0px_rgba(182,0,19,1)]"
        )}
        style={{
          height: sheetOpen ? `${panelHeightVh}vh` : "4rem",
          transition: dragHeightVh !== null ? "none" : "height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle — only rendered when open; its presence pushes player bar down */}
        {sheetOpen && (
          <div
            role="button"
            tabIndex={0}
            onPointerDown={handleDragStart}
            onClick={handleGrabberClick}
            onKeyDown={handleGrabberKeyDown}
            className="w-full shrink-0 flex items-center justify-center py-2.5 touch-none cursor-ns-resize hover:bg-surface-container-high transition-colors"
            aria-label="Resize panel"
          >
            <div className="flex items-center justify-between w-full px-4">
              <div className="w-6" />
              <div className="h-1 w-12 bg-on-background/30 rounded-full" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeSheet(); setDragHeightVh(null); dragHeightRef.current = null; }}
                className="w-6 h-6 flex items-center justify-center text-on-background/40 hover:text-on-background transition-colors"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Player bar — always in DOM; sits at BOTTOM when closed, slides to TOP when open */}
        <div className={cn(
          "h-16 shrink-0 flex items-center overflow-hidden bg-background",
          sheetOpen && "border-b-4 border-on-background"
        )}>
          <button
            className="flex-1 min-w-0 px-3 py-1 text-left active:bg-surface-container-low transition-colors"
            onClick={() => {
              if (sheetOpen) {
                closeSheet();
              } else if (currentStation) {
                openStationSheet(currentStation);
              } else {
                openNavSheet();
              }
            }}
          >
            <p className="text-[8px] font-bold text-primary uppercase tracking-widest leading-none">
              {currentStation ? (isPlaying ? "NOW_TRANSMITTING" : "PAUSED") : "AWAITING_SIGNAL"}
            </p>
            <h4 className="font-black text-[13px] uppercase tracking-tighter truncate font-headline leading-tight">
              {currentStation
                ? (currentStation.name || "UNKNOWN_STATION").toUpperCase().replace(/\s+/g, "_")
                : "SELECT_A_STATION"}
            </h4>
            {isPlaying && currentMetadata?.song && currentMetadata.song !== "No metadata available" && (
              <p className="text-[10px] text-on-background/55 truncate leading-none">
                {currentMetadata.song}
                {currentMetadata.artist && <span className="opacity-70"> · {currentMetadata.artist}</span>}
              </p>
            )}
          </button>

          <button
            onClick={isPlaying ? pause : resume}
            disabled={!currentStation || isLoading}
            className="w-12 h-full flex items-center justify-center border-l-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40 shrink-0"
          >
            {isLoading
              ? <span className="material-symbols-outlined" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
              : <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{isPlaying ? "pause" : "play_arrow"}</span>
            }
          </button>

          <button
            onClick={stop}
            disabled={!currentStation}
            className="w-12 h-full flex items-center justify-center border-l-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40 shrink-0"
          >
            <span className="material-symbols-outlined">stop_circle</span>
          </button>

          {/* SmallLogo — only in closed state */}
          {!sheetOpen && (
            <button
              onClick={openNavSheet}
              className="h-full px-3 flex items-center justify-center border-l-4 border-on-background hover:bg-surface-variant transition-colors shrink-0"
              title="Menu"
            >
              <SmallLogo size="sm" />
            </button>
          )}
        </div>

        {/* Sheet content — only rendered when open */}
        {sheetOpen && (
          sheetMode === "station" && sheetStation ? (
            <div className="flex-1 overflow-y-auto">
              <StationDetail
                station={sheetStation}
                focusCommentForm={sheetFocusComment}
                onCommentFormFocused={clearCommentFocus}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {/* Branding + session */}
              <div className="flex items-center justify-between px-4 py-3 border-b-4 border-on-background">
                <span className="text-xl font-black text-on-background border-4 border-on-background px-2 py-0.5 rotate-[-2deg] font-headline uppercase tracking-tighter select-none">
                  WAVEFUNC
                </span>
                <LoginSessionButtons />
              </div>

              {/* Search */}
              <div className="px-4 pt-3 pb-2 border-b-2 border-on-background/10">
                <UnifiedSearchInput
                  searchInput={searchInput}
                  setSearchInput={setSearchInput}
                  onStationSearch={(q) => { onSearch(q); closeSheet(); }}
                />
              </div>

              {/* Nav links */}
              <nav className="flex flex-col">
                <NavigationItems variant="mobile" onNavigate={closeSheet} />
              </nav>
            </div>
          )
        )}
      </div>

      {/* ── Desktop station detail panel ── */}
      <div
        className="hidden md:block fixed left-0 right-0 bottom-0 z-[65] overflow-hidden"
        style={{
          height: "60vh",
          transform: sheetOpen && sheetMode === "station" && sheetStation
            ? "translateY(0)"
            : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="h-full flex flex-col bg-background border-t-4 border-on-background">
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-2 border-b-4 border-on-background shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-on-background/40">
              STATION_INSPECTOR
            </span>
            <button
              onClick={closeSheet}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              CLOSE
            </button>
          </div>
          {/* Station detail content */}
          <div className="flex-1 overflow-y-auto pb-[100px]">
            {sheetStation && (
              <StationDetail
                station={sheetStation}
                focusCommentForm={sheetFocusComment}
                onCommentFormFocused={clearCommentFocus}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Desktop footer (md+) ── */}
      <footer className="hidden md:block fixed bottom-0 left-0 right-0 w-full z-[70] bg-background h-[100px] border-t-4 border-on-background shadow-[0_-8px_0px_0px_rgba(182,0,19,1)]">
        <div className="flex h-full items-stretch">

          {/* Station info */}
          <div className="flex items-center gap-4 px-4 flex-grow max-w-xs border-r-4 border-on-background overflow-hidden">
            <div className="w-12 h-12 bg-on-background border-2 border-primary-fixed-dim flex items-center justify-center text-secondary-fixed-dim shrink-0">
              {currentStation?.thumbnail ? (
                <img src={currentStation.thumbnail} alt={currentStation.name || "Station"} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-3xl" style={{ animation: isPlaying ? "spin 3s linear infinite" : "none" }}>
                  album
                </span>
              )}
            </div>
            <div className="flex flex-col justify-center overflow-hidden min-w-0 gap-0.5">
              <p className="font-bold uppercase text-[9px] text-primary tracking-widest leading-none">
                {currentStation ? "NOW_TRANSMITTING" : "AWAITING_SIGNAL"}
              </p>
              <h4 className="font-black text-base uppercase tracking-tighter truncate font-headline leading-tight">
                {currentStation
                  ? (currentStation.name || "UNKNOWN_STATION").toUpperCase().replace(/\s+/g, "_")
                  : "SELECT_A_STATION"}
              </h4>
              {isPlaying && currentMetadata?.song && currentMetadata.song !== "No metadata available" && (
                <p
                  className="truncate text-[11px] text-on-background/70 cursor-pointer hover:text-primary transition-colors leading-tight"
                  onClick={handleSearchMetadata}
                  title="Search on MusicBrainz"
                >
                  {currentMetadata.song}
                  {currentMetadata.artist && <span className="opacity-60"> • {currentMetadata.artist}</span>}
                </p>
              )}
              {isPlaying && !currentMetadata?.song && <Skeleton className="h-3 w-28 mt-0.5" />}
              {error && <p className="truncate text-[9px] text-destructive uppercase tracking-wider leading-tight">{error}</p>}
              {currentStation && (
                <div className="mt-1">
                  <PlayerSocialBar station={currentStation} />
                </div>
              )}
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-stretch flex-grow justify-center">
            <button
              onClick={stop}
              disabled={!currentStation}
              className="text-on-background px-5 lg:px-8 flex items-center justify-center border-r-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40"
              title="Stop"
            >
              <span className="material-symbols-outlined">stop_circle</span>
            </button>
            <button
              onClick={resume}
              disabled={!currentStation || isLoading || isPlaying}
              className="bg-secondary-fixed-dim text-on-background px-10 lg:px-16 flex flex-col justify-center items-center hover:translate-y-1 transition-all active:translate-y-2 border-x-4 border-on-background disabled:opacity-40"
              title="Play"
            >
              {isLoading ? (
                <span className="material-symbols-outlined text-4xl" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
              ) : (
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              )}
              <span className="font-bold uppercase text-[9px]">{isLoading ? "TUNING" : "PLAY"}</span>
            </button>
            <button
              onClick={pause}
              disabled={!currentStation || isLoading || !isPlaying}
              className="text-on-background px-5 lg:px-8 flex items-center justify-center border-r-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40"
              title="Pause"
            >
              <span className="material-symbols-outlined">pause</span>
            </button>
            <div className="text-on-background px-5 lg:px-8 flex items-center justify-center hover:bg-surface-variant transition-all">
              <HistorySheet />
            </div>
          </div>

          {/* Volume — xl+ only */}
          <div className="hidden xl:flex items-center gap-4 px-8 border-l-4 border-on-background bg-surface-container-low">
            <button
              onClick={toggleMute}
              className="text-on-background hover:text-primary transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              <span className="material-symbols-outlined">{isMuted ? "volume_off" : "volume_up"}</span>
            </button>
            <div
              className="w-32 h-6 bg-on-background/10 border-2 border-on-background relative cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume((e.clientX - rect.left) / rect.width);
              }}
              title={`Volume: ${Math.round(volume * 100)}`}
            >
              <div className="absolute inset-0 bg-primary transition-all" style={{ width: `${isMuted ? 0 : volume * 100}%` }} />
              <div className="absolute top-0 bottom-0 w-1 bg-on-background" style={{ left: `${isMuted ? 0 : volume * 100}%` }} />
            </div>
          </div>

        </div>
      </footer>
    </>
  );
}
