import { useEffect, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { useSearchStore } from "../stores/searchStore";
import Hls from "hls.js";
import { Skeleton } from "@/components/ui/skeleton";
import { HistorySheet } from "./HistorySheet";

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

  // Handler to search MusicBrainz with current metadata
  const handleSearchMetadata = () => {
    if (!currentMetadata?.song) return;

    const query = currentMetadata.artist
      ? `${currentMetadata.song} ${currentMetadata.artist}`
      : currentMetadata.song;

    triggerMusicBrainzSearch(query);
  };

  // Initialize audio element in the store
  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
    return () => {
      setAudioElement(null);
      // Clean up HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [setAudioElement]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleLoadStart = () => {
      setIsLoading(true);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleError = (e: Event) => {
      const audioError = (e.target as HTMLAudioElement).error;
      const errorMessage = audioError
        ? `Error ${audioError.code}: ${audioError.message}`
        : "Failed to load audio";
      console.error("Audio error:", errorMessage, audioError);
      setError(errorMessage);
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
    };

    const handleStalled = () => {
      console.warn("Audio: stalled - media fetching stalled");
    };

    const handleSuspend = () => {
      console.log("Audio: suspend - loading suspended");
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("suspend", handleSuspend);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("suspend", handleSuspend);
    };
  }, [setIsPlaying, setIsLoading, setError]);

  return (
    <>
      {/* Hidden audio element - ALWAYS rendered */}
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />

      <footer className="fixed bottom-0 left-0 w-full z-[70] flex justify-center items-center bg-background h-32 border-t-4 border-on-background shadow-[0_-8px_0px_0px_rgba(182,0,19,1)]">
        <div className="flex h-full w-full items-stretch justify-between">

          {/* Current Track */}
          <div className="flex items-center gap-6 px-6 flex-grow max-w-md border-r-4 border-on-background overflow-hidden">
            <div className="w-16 h-16 bg-on-background border-2 border-primary-fixed-dim flex items-center justify-center text-secondary-fixed-dim shrink-0">
              {currentStation?.thumbnail ? (
                <img
                  src={currentStation.thumbnail}
                  alt={currentStation.name || "Station"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-4xl" style={{ animation: isPlaying ? "spin 3s linear infinite" : "none" }}>
                  album
                </span>
              )}
            </div>
            <div className="overflow-hidden">
              <p className="font-bold uppercase text-[10px] text-primary tracking-widest">
                {currentStation ? "NOW_TRANSMITTING" : "AWAITING_SIGNAL"}
              </p>
              <h4 className="font-black text-2xl uppercase tracking-tighter truncate font-headline">
                {currentStation
                  ? (currentStation.name || "UNKNOWN_STATION").toUpperCase().replace(/\s+/g, "_")
                  : "SELECT_A_STATION"}
              </h4>
              {isPlaying && currentMetadata?.song && currentMetadata.song !== "No metadata available" && (
                <p
                  className="truncate text-xs text-on-background/70 mt-0.5 cursor-pointer hover:text-primary transition-colors"
                  onClick={handleSearchMetadata}
                  title="Search on MusicBrainz"
                >
                  {currentMetadata.song}
                  {currentMetadata.artist && (
                    <span className="opacity-60"> • {currentMetadata.artist}</span>
                  )}
                </p>
              )}
              {isPlaying && !currentMetadata?.song && (
                <Skeleton className="h-3 w-32 mt-1" />
              )}
              {error && (
                <p className="truncate text-[10px] text-destructive uppercase tracking-wider mt-0.5">{error}</p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-stretch flex-grow justify-center">
            <button
              onClick={stop}
              disabled={!currentStation}
              className="text-on-background px-8 lg:px-12 flex flex-col justify-center items-center border-r-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40"
              title="Stop"
            >
              <span className="material-symbols-outlined scale-125 mb-1">stop_circle</span>
              <span className="font-bold uppercase text-[10px]">STOP</span>
            </button>
            <button
              onClick={resume}
              disabled={!currentStation || isLoading || isPlaying}
              className="bg-secondary-fixed-dim text-on-background px-12 lg:px-20 flex flex-col justify-center items-center hover:translate-y-2 transition-all active:translate-y-4 border-x-4 border-on-background disabled:opacity-40"
              title="Play"
            >
              {isLoading ? (
                <span className="material-symbols-outlined text-5xl" style={{ animation: "spin 0.8s linear infinite" }}>
                  sync
                </span>
              ) : (
                <span className="material-symbols-outlined text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  play_arrow
                </span>
              )}
              <span className="font-bold uppercase text-[10px]">{isLoading ? "TUNING" : "PLAY"}</span>
            </button>
            <button
              onClick={pause}
              disabled={!currentStation || isLoading || !isPlaying}
              className="text-on-background px-8 lg:px-12 flex flex-col justify-center items-center border-r-2 border-on-background/20 hover:bg-surface-variant transition-all disabled:opacity-40"
              title="Pause"
            >
              <span className="material-symbols-outlined scale-125 mb-1">pause</span>
              <span className="font-bold uppercase text-[10px]">PAUSE</span>
            </button>
            <div className="text-on-background px-8 lg:px-12 flex flex-col justify-center items-center hover:bg-surface-variant transition-all">
              <HistorySheet />
            </div>
          </div>

          {/* Volume — xl+ only */}
          <div className="hidden xl:flex items-center gap-6 px-12 border-l-4 border-on-background bg-surface-container-low">
              <button
                onClick={toggleMute}
                className="text-on-background hover:text-primary transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
              >
                <span className="material-symbols-outlined">
                  {isMuted ? "volume_off" : "volume_up"}
                </span>
              </button>
              <div
                className="w-40 h-8 bg-on-background/10 border-2 border-on-background relative cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setVolume((e.clientX - rect.left) / rect.width);
                }}
                title={`Volume: ${Math.round(volume * 100)}`}
              >
                <div
                  className="absolute inset-0 bg-primary transition-all"
                  style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-on-background"
                  style={{ left: `${isMuted ? 0 : volume * 100}%` }}
                />
              </div>
            </div>

        </div>
      </footer>
    </>
  );
}
