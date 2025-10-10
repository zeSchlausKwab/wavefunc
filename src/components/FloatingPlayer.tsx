import { useEffect, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import { Play, Pause, X, Volume2, VolumeX } from "lucide-react";
import Hls from "hls.js";

export function FloatingPlayer() {
  const {
    currentStation,
    currentStream,
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

  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

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

      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-gray-900 to-gray-800 backdrop-blur-md border-t border-gray-700 shadow-lg">
        {!currentStation ? (
          <div className="container mx-auto px-8 py-4">
            <div className="flex items-center justify-center">
              <p className="text-gray-400 text-sm">
                Select a radio station to start playing
              </p>
            </div>
          </div>
        ) : (
          <div className="container mx-auto px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Station Info */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {currentStation.thumbnail && (
                  <img
                    src={currentStation.thumbnail}
                    alt={currentStation.name || "Station"}
                    className="w-14 h-14 rounded-md object-cover shadow-md"
                  />
                )}
                <div className="flex-1 min-w-0">
                  {/* Now Playing Metadata */}
                  {currentMetadata?.song && (
                    <>
                      <h3 className="text-white font-bold truncate">
                        {currentMetadata.song}
                      </h3>
                      <p className="text-gray-300 text-sm truncate">
                        {currentMetadata.artist || "Unknown Artist"}
                      </p>
                      {currentMetadata.musicBrainz?.release && (
                        <p className="text-gray-500 text-xs truncate">
                          from {currentMetadata.musicBrainz.release}
                          {currentMetadata.musicBrainz.releaseDate && (
                            <>
                              {" "}
                              (
                              {
                                currentMetadata.musicBrainz.releaseDate.split(
                                  "-"
                                )[0]
                              }
                              )
                            </>
                          )}
                        </p>
                      )}
                    </>
                  )}

                  {/* Fallback: Station Info */}
                  {!currentMetadata?.song && (
                    <>
                      <h3 className="text-white font-semibold truncate">
                        {currentStation.name || "Unnamed Station"}
                      </h3>
                      <p className="text-gray-400 text-sm truncate">
                        {currentStream?.format}
                        {currentStream?.quality?.bitrate &&
                          currentStream.quality.bitrate > 0 && (
                            <>
                              {" "}
                              •{" "}
                              {Math.round(currentStream.quality.bitrate / 1000)}
                              kbps
                            </>
                          )}
                      </p>
                    </>
                  )}

                  {error && (
                    <p className="text-red-400 text-xs truncate mt-1">
                      {error}
                    </p>
                  )}
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center gap-3">
                {/* Play/Pause Button */}
                <button
                  onClick={isPlaying ? pause : resume}
                  disabled={isLoading}
                  className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full text-white transition-colors shadow-lg"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                </button>

                {/* Stop Button */}
                <button
                  onClick={stop}
                  className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
                  title="Stop"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-2 min-w-[150px]">
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume * 100}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                  className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  title="Volume"
                />
                <span className="text-gray-400 text-sm min-w-[3ch]">
                  {Math.round(volume * 100)}
                </span>
              </div>
            </div>
          </div>
        )}
      </footer>
    </>
  );
}
