import { useEffect, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { useSearchStore } from "../stores/searchStore";
import { Play, Pause, X, Volume2, VolumeX, Radio } from "lucide-react";
import Hls from "hls.js";
import { useMedia } from "react-use";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spectrogram } from "./Spectrogram";
import { HistorySheet } from "./HistorySheet";

export function FloatingPlayer() {
  const isMobile = useMedia("(max-width: 768px)");

  const {
    currentStation,
    currentStream,
    currentMetadata,
    isPlaying,
    isLoading,
    error,
    volume,
    isMuted,
    analyser,
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

  // Derived: simple human-friendly stream label
  const formatLabel = currentStream
    ? currentStream.url?.includes(".m3u8")
      ? "HLS"
      : (currentStream.format || "stream").replace("audio/", "").toUpperCase()
    : "";

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

      <footer className="fixed bottom-1 left-1 right-1 md:bottom-2 md:left-2 md:right-2 z-50 border-2 border-black bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-brutal overflow-hidden">
        {!currentStation ? (
          <div className="flex h-16 items-center justify-between px-4">
            <p className="text-sm text-muted-foreground">
              Select a radio station to start playing
            </p>
            <div className="relative z-10">
              <HistorySheet />
            </div>
          </div>
        ) : (
          <div className="relative flex h-16 items-center gap-4 px-4">
            {/* Spectrogram Background */}
            <Spectrogram
              analyser={analyser}
              isPlaying={isPlaying}
              color="rgb(0, 0, 0)"
              className="opacity-10"
            />
            {/* Station Thumbnail & Info */}
            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
              {currentStation.thumbnail ? (
                <img
                  src={currentStation.thumbnail}
                  alt={currentStation.name || "Station"}
                  className="size-12 shrink-0 rounded-md object-cover shadow-sm"
                />
              ) : (
                <div className="size-12 shrink-0 rounded-md bg-secondary flex items-center justify-center">
                  <Radio className="size-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">
                  {currentStation.name || "Unnamed Station"}
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {formatLabel}
                  {currentStream?.quality?.bitrate &&
                    currentStream.quality.bitrate > 0 && (
                      <>
                        {" "}
                        • {Math.round(currentStream.quality.bitrate / 1000)}
                        kbps
                      </>
                    )}
                </p>
                {isPlaying && (
                  <>
                    {currentMetadata?.song ? (
                      currentMetadata.song === "No metadata available" ||
                      currentMetadata.title === "No metadata available" ? (
                        <p className="truncate text-xs text-muted-foreground mt-0.5 italic">
                          No metadata available
                        </p>
                      ) : (
                        <p
                          className="truncate text-xs text-foreground mt-0.5 cursor-pointer hover:text-primary transition-colors underline decoration-dotted underline-offset-2"
                          onClick={handleSearchMetadata}
                          title="Click to search on MusicBrainz"
                        >
                          {currentMetadata.song}
                          {currentMetadata.artist && (
                            <span className="text-muted-foreground">
                              {" "}
                              • {currentMetadata.artist}
                            </span>
                          )}
                          {currentMetadata.musicBrainz?.release && (
                            <span className="text-muted-foreground">
                              {" "}
                              • {currentMetadata.musicBrainz.release}
                              {currentMetadata.musicBrainz.releaseDate && (
                                <span>
                                  {" "}
                                  (
                                  {
                                    currentMetadata.musicBrainz.releaseDate.split(
                                      "-"
                                    )[0]
                                  }
                                  )
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      )
                    ) : (
                      <div className="mt-1 space-y-1">
                        <Skeleton className="h-3 w-32" />
                      </div>
                    )}
                  </>
                )}
                {error && (
                  <p className="truncate text-xs text-destructive">{error}</p>
                )}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="relative z-10 flex items-center gap-2">
              <Button
                size="icon"
                onClick={isPlaying ? pause : resume}
                disabled={isLoading}
                className="size-10 shrink-0"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isLoading ? (
                  <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : isPlaying ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={stop}
                className="size-8 shrink-0"
                title="Stop"
              >
                <X className="size-4" />
              </Button>
              <HistorySheet />
            </div>

            {/* Volume Control - Desktop only */}
            {!isMobile && (
              <>
                <Separator
                  orientation="vertical"
                  className="h-8 relative z-10"
                />
                <div className="relative z-10 flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleMute}
                    className="size-8 shrink-0"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <VolumeX className="size-4" />
                    ) : (
                      <Volume2 className="size-4" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume * 100}
                    onChange={(e) => setVolume(Number(e.target.value) / 100)}
                    className="h-1 w-24 cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
                    title="Volume"
                  />
                  <span className="min-w-[2.5ch] text-xs text-muted-foreground">
                    {Math.round(volume * 100)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </footer>
    </>
  );
}
