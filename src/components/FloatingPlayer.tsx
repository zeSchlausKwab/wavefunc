import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { useMetadataStore } from "../stores/metadataStore";
import { useSearchStore } from "../stores/searchStore";
import { useUIStore } from "../stores/uiStore";
import { buildStationReactionTemplate, type ParsedStation } from "../lib/nostr/domain";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { useMediaSession } from "../lib/hooks/useMediaSession";
import { useWakeLock } from "../lib/hooks/useWakeLock";
import { shareOrCopy } from "../lib/share";
import { SleepTimerButton } from "./SleepTimerButton";
import Hls from "hls.js";
import { Skeleton } from "@/components/ui/skeleton";
import { HistorySheet } from "./HistorySheet";
import { ZapDialog } from "./ZapDialog";
import { PlayerDiagnostics, useDiagnosticsEnabled } from "./PlayerDiagnostics";
import { StationDetail } from "./StationDetail";
import { cn } from "@/lib/utils";
import { SmallLogo } from "./SmallLogo";
import { MobileNavigationSidebar } from "./MobileNavigationSidebar";
import { SongFavoriteButton } from "./SongFavoriteButton";
import { SongMagicButton } from "./SongMagicButton";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useStationHealth } from "../lib/nostr/hooks/useStationObservations";
import { StationHealthBadge } from "./StationHealthBadge";

// ─── Snap levels ──────────────────────────────────────────────────────────────

const PEEK_VH = 60;
const EXPANDED_VH = 82;
const SNAP_THRESHOLD_VH = (PEEK_VH + EXPANDED_VH) / 2;

function clampPanelVh(vh: number) {
  return Math.min(EXPANDED_VH, Math.max(PEEK_VH, vh));
}

// ─── Social bar ───────────────────────────────────────────────────────────────

function PlayerSocialBar({ station }: { station: ParsedStation }) {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const [showZapDialog, setShowZapDialog] = useState(false);
  const { reactions, zaps, userHasReacted, userHasZapped } =
    useSocialInteractions(station.event);

  const handleLike = async () => {
    if (!currentUser) return;
    await signAndPublish(buildStationReactionTemplate(station.event));
  };

  const handleShare = () => {
    void shareOrCopy({
      url: `${window.location.origin}/station/${station.naddr}`,
      title: station.name || "WaveFunc Radio",
      text: `Listen to ${station.name || "this station"} on WaveFunc`,
    });
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
  //
  // We read the state machine directly for precise UI states, plus a
  // handful of flat fields for legacy call sites and actions. The
  // supervisor (owned by the store) drives transitions — this
  // component does NOT attach audio event listeners; it only mounts
  // the element and hands it off via setAudioElement.
  const state = usePlayerStore((s) => s.state);
  const currentStation = usePlayerStore((s) => s.currentStation);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const error = usePlayerStore((s) => s.error);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const stop = usePlayerStore((s) => s.stop);
  const retry = usePlayerStore((s) => s.retry);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setAudioElement = usePlayerStore((s) => s.setAudioElement);

  // Metadata comes from its own store now (decoupled from playback).
  const currentMetadata = useMetadataStore((s) => s.currentMetadata);
  const hasCurrentSong = Boolean(
    currentMetadata?.song?.trim() &&
      currentMetadata.song !== "No metadata available",
  );
  const showTrackActions = isPlaying || hasCurrentSong;
  const healthAddresses = useMemo(
    () => (currentStation?.address ? [currentStation.address] : []),
    [currentStation?.address],
  );
  const { byAddress: healthByAddress } = useStationHealth(healthAddresses);
  const currentHealth = currentStation?.address
    ? healthByAddress.get(currentStation.address)
    : undefined;

  // Mirror playback state to the OS media session (lockscreen controls,
  // headset buttons, macOS Now Playing, Windows SMTC, etc). No-op in
  // browsers without the API.
  useMediaSession();

  // Derive a user-facing status label from the state machine. This is
  // what we show in the "NOW_TRANSMITTING" slot to reflect the real
  // player state rather than a boolean.
  const statusLabel = useMemo(() => {
    switch (state.kind) {
      case "idle":
        return "AWAITING_SIGNAL";
      case "loading":
        return state.candidateCount > 1 && state.attempt > 1
          ? `TRYING_${state.attempt}_OF_${state.candidateCount}`
          : "CONNECTING";
      case "playing":
        return "NOW_TRANSMITTING";
      case "buffering":
        return "BUFFERING";
      case "reconnecting":
        return `RECONNECTING_${state.attempt}`;
      case "failed":
        return "CONNECTION_FAILED";
      case "paused":
        return "PAUSED";
    }
  }, [state]);

  const diagnosticsEnabled = useDiagnosticsEnabled();

  const { triggerMusicBrainzSearch } = useSearchStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // ── Mobile chrome state (global) ──
  const {
    sidebarOpen,
    stationSheetOpen,
    sheetStation,
    sheetSnap,
    sheetFocusComment,
    openSidebar,
    openStationSheet,
    closeSheet,
    setSheetSnap,
    clearCommentFocus,
  } = useUIStore();

  // Keep the screen on while the user is actively looking at an
  // expanded station sheet during playback. The hook releases the lock
  // automatically when the tab is hidden, so we don't need to care
  // about foreground/background transitions here. When the sheet
  // collapses back to the peek bar we assume the user has moved on
  // and drop the lock.
  useWakeLock(isPlaying && stationSheetOpen && sheetSnap === "expanded");

  // ── Drag state (local, transient) ──
  const [dragHeightVh, setDragHeightVh] = useState<number | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragStartHeightRef = useRef<number>(PEEK_VH);
  const draggedRef = useRef(false);

  const baseHeightVh = sheetSnap === "expanded" ? EXPANDED_VH : PEEK_VH;
  const panelHeightVh = dragHeightVh ?? baseHeightVh;

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
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
      setSheetSnap("expanded");
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

  // Mount the audio element into the store. The store spins up a
  // PlaybackSupervisor that owns the element's playback event listeners
  // (play/pause/waiting/stalled/canplay/error) and drives the state
  // machine. Do NOT add audio listeners here — the supervisor is the
  // single source of truth for audio events.
  useEffect(() => {
    if (audioRef.current) setAudioElement(audioRef.current);
    return () => {
      setAudioElement(null);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [setAudioElement]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />

      {/* ── Mobile navigation sidebar ── */}
      <MobileNavigationSidebar
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearch={onSearch}
      />

      {/* ── Mobile station detail sheet ── */}
      <div
        className={cn(
          "md:hidden fixed left-0 right-0 bottom-20 z-[70] bg-background border-t-4 border-on-background overflow-hidden flex flex-col",
          !stationSheetOpen && "pointer-events-none"
        )}
        style={{
          height: `${panelHeightVh}vh`,
          transform: stationSheetOpen ? "translateY(0)" : "translateY(100%)",
          transition: dragHeightVh !== null
            ? "none"
            : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        aria-hidden={!stationSheetOpen}
        inert={!stationSheetOpen}
      >
        <div
          role="button"
          tabIndex={stationSheetOpen ? 0 : -1}
          onPointerDown={handleDragStart}
          onClick={handleGrabberClick}
          onKeyDown={handleGrabberKeyDown}
          className="w-full h-12 shrink-0 flex items-center justify-center touch-none cursor-ns-resize hover:bg-surface-container-high transition-colors"
          aria-label="Resize station details"
          title={sheetSnap === "expanded" ? "Collapse station details" : "Expand station details"}
        >
          <div className="flex items-center justify-between w-full px-4">
            <div className="w-6" />
            <div className="h-1 w-12 bg-on-background/30 rounded-full" />
            <button
              type="button"
              tabIndex={stationSheetOpen ? 0 : -1}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                closeSheet();
                setDragHeightVh(null);
                dragHeightRef.current = null;
              }}
              className="w-6 h-6 flex items-center justify-center text-on-background/40 hover:text-on-background transition-colors"
              aria-label="Close station details"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {diagnosticsEnabled && <PlayerDiagnostics />}
          {sheetStation && (
            <StationDetail
              station={sheetStation}
              focusCommentForm={sheetFocusComment}
              onCommentFormFocused={clearCommentFocus}
            />
          )}
        </div>
      </div>

      {/* ── Persistent mobile player ── */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 z-[90] h-20 flex items-center overflow-hidden bg-background border-t-4 border-on-background shadow-[0_-8px_0px_0px_rgba(182,0,19,1)]">
        <button
          type="button"
          disabled={!currentStation}
          className="flex h-full flex-1 min-w-0 flex-col justify-center px-3 py-1.5 text-left active:bg-surface-container-low transition-colors cursor-pointer"
          onClick={() => {
            if (!currentStation) return;
            if (stationSheetOpen) closeSheet();
            else openStationSheet(currentStation);
          }}
          aria-label={currentStation ? "Open station details" : "No station selected"}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <p className={cn(
              "truncate text-[8px] font-bold uppercase tracking-widest leading-none",
              state.kind === "failed" ? "text-destructive" :
              state.kind === "reconnecting" || state.kind === "buffering" ? "text-secondary-fixed-dim" :
              "text-primary"
            )}>
              {statusLabel}
            </p>
            {currentStation && (
              <StationHealthBadge
                health={currentHealth}
                compact
                showPending
                className="shrink-0 border shadow-none"
              />
            )}
          </div>
          <h4 className="font-black text-[13px] uppercase tracking-tighter truncate font-headline leading-tight">
            {currentStation
              ? (currentStation.name || "UNKNOWN_STATION").toUpperCase().replace(/\s+/g, "_")
              : "SELECT_A_STATION"}
          </h4>
          <div className="flex min-h-3 min-w-0 items-center">
            {hasCurrentSong ? (
              <p className="min-w-0 flex-1 truncate text-[10px] leading-none text-on-background/55">
                {currentMetadata?.song}
                {currentMetadata?.artist && <span className="opacity-70"> · {currentMetadata.artist}</span>}
              </p>
            ) : isPlaying ? (
              <div
                role="status"
                aria-label="Loading now playing"
                className="flex min-w-0 flex-1 animate-pulse items-center gap-1.5"
              >
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-2.5 w-10 opacity-60" />
              </div>
            ) : null}
          </div>
        </button>

        {showTrackActions && (
          <div
            role="group"
            aria-label="Track actions"
            className="flex h-full w-10 shrink-0 flex-col border-l-2 border-on-background/20"
          >
            {hasCurrentSong ? (
              <>
                <SongFavoriteButton
                  size="md"
                  className="min-h-10 min-w-10 flex-1 hover:bg-surface-variant"
                />
                <SongMagicButton
                  size="md"
                  className="min-h-10 min-w-10 flex-1 border-t-2 border-on-background/20 hover:bg-surface-variant"
                />
              </>
            ) : (
              <>
                <div className="flex min-h-10 min-w-10 flex-1 items-center justify-center" aria-hidden="true">
                  <Skeleton className="h-4 w-4" />
                </div>
                <div className="flex min-h-10 min-w-10 flex-1 items-center justify-center border-t-2 border-on-background/20" aria-hidden="true">
                  <Skeleton className="h-4 w-4" />
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={state.kind === "failed" ? retry : isPlaying ? pause : resume}
          disabled={!currentStation}
          className="w-12 h-full flex items-center justify-center border-l-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40 shrink-0"
          title={
            state.kind === "failed" ? "Retry" :
            state.kind === "reconnecting" ? "Reconnecting…" :
            state.kind === "buffering" ? "Buffering…" :
            isPlaying ? "Pause" : "Play"
          }
        >
          {state.kind === "failed" ? (
            <span className="material-symbols-outlined">refresh</span>
          ) : isLoading ? (
            <span className="material-symbols-outlined" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
          ) : (
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{isPlaying ? "pause" : "play_arrow"}</span>
          )}
        </button>

        <button
          onClick={stop}
          disabled={!currentStation}
          className="w-12 h-full flex items-center justify-center border-l-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40 shrink-0"
          title="Stop"
        >
          <span className="material-symbols-outlined">stop_circle</span>
        </button>

        <button
          onClick={openSidebar}
          className="h-full px-3 flex items-center justify-center border-l-4 border-on-background hover:bg-surface-variant transition-colors shrink-0"
          title="Open navigation"
          aria-label="Open navigation"
          aria-expanded={sidebarOpen}
          aria-controls="mobile-navigation-sidebar"
        >
          <SmallLogo size="sm" />
        </button>
      </div>

      {/* ── Desktop station detail panel ── */}
      <div
        className="hidden md:block fixed left-0 right-0 bottom-0 z-[65] overflow-hidden"
        style={{
          height: "60vh",
          transform: stationSheetOpen && sheetStation
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
            {diagnosticsEnabled && <PlayerDiagnostics />}
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
      <footer className="hidden md:block fixed bottom-0 left-0 right-0 w-full z-[70] bg-background h-[100px] border-t-4 border-on-background shadow-[0_-8px_0px_0px_rgba(182,0,19,1)] overflow-hidden">
        <div className="flex h-full items-stretch">

          {/* Station info — shrinks to fit, never overflows */}
          <div className="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 shrink min-w-0 w-[200px] lg:w-[250px] xl:w-[320px] border-r-4 border-on-background overflow-hidden">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-on-background border-2 border-primary-fixed-dim flex items-center justify-center text-secondary-fixed-dim shrink-0">
              {currentStation?.thumbnail ? (
                <img src={currentStation.thumbnail} alt={currentStation.name || "Station"} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-2xl lg:text-3xl" style={{ animation: isPlaying ? "spin 3s linear infinite" : "none" }}>
                  album
                </span>
              )}
            </div>
            <div className="flex flex-col justify-center overflow-hidden min-w-0 gap-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className={cn(
                  "truncate font-bold uppercase text-[9px] tracking-widest leading-none",
                  state.kind === "failed" ? "text-destructive" :
                  state.kind === "reconnecting" || state.kind === "buffering" ? "text-secondary-fixed-dim" :
                  "text-primary"
                )}>
                  {statusLabel}
                </p>
                {currentStation && (
                  <StationHealthBadge
                    health={currentHealth}
                    compact
                    showPending
                    className="shrink-0 border shadow-none"
                  />
                )}
              </div>
              <h4 className="font-black text-sm lg:text-base uppercase tracking-tighter truncate font-headline leading-tight">
                {currentStation
                  ? (currentStation.name || "UNKNOWN_STATION").toUpperCase().replace(/\s+/g, "_")
                  : "SELECT_A_STATION"}
              </h4>
              {isPlaying && currentMetadata?.song && currentMetadata.song !== "No metadata available" && (
                <div className="flex items-center gap-1 min-w-0">
                  <p
                    className="truncate text-[10px] lg:text-[11px] text-on-background/70 cursor-pointer hover:text-primary transition-colors leading-tight flex-1 min-w-0"
                    onClick={handleSearchMetadata}
                    title="Search on MusicBrainz"
                  >
                    {currentMetadata.song}
                    {currentMetadata.artist && <span className="opacity-60"> • {currentMetadata.artist}</span>}
                  </p>
                  <SongFavoriteButton size="sm" className="shrink-0" />
                  <SongMagicButton size="sm" className="shrink-0" />
                </div>
              )}
              {isPlaying && !currentMetadata?.song && <Skeleton className="h-3 w-24 mt-0.5" />}
              {error && <p className="truncate text-[9px] text-destructive uppercase tracking-wider leading-tight">{error}</p>}
              {currentStation && (
                <div className="mt-0.5">
                  <PlayerSocialBar station={currentStation} />
                </div>
              )}
            </div>
          </div>

          {/* Transport controls — flex-1 so they fill available space */}
          <div className="flex items-stretch flex-1 justify-center min-w-0">
            <button
              onClick={stop}
              disabled={!currentStation}
              className="text-on-background px-2 md:px-3 lg:px-4 xl:px-6 flex items-center justify-center border-r-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40 shrink-0"
              title="Stop"
            >
              <span className="material-symbols-outlined text-[22px]">stop_circle</span>
            </button>
            <button
              onClick={state.kind === "failed" ? retry : resume}
              disabled={!currentStation || isPlaying || state.kind === "reconnecting"}
              className="bg-secondary-fixed-dim text-on-background px-3 md:px-5 lg:px-8 xl:px-14 flex flex-col justify-center items-center hover:translate-y-1 transition-all active:translate-y-2 border-x-4 border-on-background disabled:opacity-40 shrink-0"
              title={
                state.kind === "failed" ? "Retry" :
                state.kind === "reconnecting" ? "Reconnecting…" :
                state.kind === "buffering" ? "Buffering…" :
                state.kind === "loading" ? "Tuning…" :
                "Play"
              }
            >
              {state.kind === "failed" ? (
                <span className="material-symbols-outlined text-3xl lg:text-4xl">refresh</span>
              ) : isLoading ? (
                <span className="material-symbols-outlined text-3xl lg:text-4xl" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
              ) : (
                <span className="material-symbols-outlined text-3xl lg:text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              )}
              <span className="font-bold uppercase text-[8px] lg:text-[9px]">
                {state.kind === "failed" ? "RETRY" :
                 state.kind === "reconnecting" ? "RECONNECT" :
                 state.kind === "buffering" ? "BUFFER" :
                 state.kind === "loading" ? "TUNING" :
                 "PLAY"}
              </span>
            </button>
            <button
              onClick={pause}
              disabled={!currentStation || isLoading || !isPlaying}
              className="text-on-background px-2 md:px-3 lg:px-4 xl:px-6 flex items-center justify-center border-r-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40 shrink-0"
              title="Pause"
            >
              <span className="material-symbols-outlined text-[22px]">pause</span>
            </button>
            <div className="text-on-background px-2 md:px-3 lg:px-4 xl:px-6 flex items-center justify-center hover:bg-surface-variant transition-all shrink-0">
              <HistorySheet />
            </div>
            <SleepTimerButton variant="compact" />
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 lg:gap-3 px-2 md:px-3 xl:px-4 border-l-4 border-on-background bg-surface-container-low shrink-0">
            <button
              onClick={toggleMute}
              className="text-on-background hover:text-primary transition-colors shrink-0"
              title={isMuted ? "Unmute" : "Mute"}
            >
              <span className="material-symbols-outlined">{isMuted ? "volume_off" : "volume_up"}</span>
            </button>
            <div
              className="w-16 lg:w-20 xl:w-24 h-6 bg-on-background/10 border-2 border-on-background relative cursor-pointer shrink-0"
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
