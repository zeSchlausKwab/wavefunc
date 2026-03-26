import { useEffect, useRef, useState } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { usePlayerStore } from "../stores/playerStore";
import { useSearchStore } from "../stores/searchStore";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { NDKStation } from "../lib/NDKStation";
import Hls from "hls.js";
import { Skeleton } from "@/components/ui/skeleton";
import { HistorySheet } from "./HistorySheet";
import { ZapDialog } from "./ZapDialog";
import { cn } from "@/lib/utils";

// ─── Social bar (only mounts when a station is loaded) ────────────────────────

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
          className="flex items-center gap-0.5 hover:text-primary transition-colors"
          title={`Comment${comments > 0 ? ` (${comments})` : ""}`}
        >
          <span className={cn("material-symbols-outlined text-[14px]", userHasCommented && "text-primary")}>
            comment
          </span>
          {comments > 0 && <span className="text-[9px] font-bold">{comments}</span>}
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

export function FloatingPlayer() {
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

  return (
    <>
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />

      <footer className="fixed bottom-0 left-0 w-full z-[70] flex bg-background h-[100px] border-t-4 border-on-background shadow-[0_-8px_0px_0px_rgba(182,0,19,1)]">

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

      </footer>
    </>
  );
}
