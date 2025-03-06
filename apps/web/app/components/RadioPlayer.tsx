"use client";

import { Button } from "@/components/ui/button";
import { useAtom } from "jotai";
import {
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { currentStationAtom } from "../atoms/stations";
import { MusicRecognitionButton } from "./MusicRecognitionButton";

interface StreamMetadata {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  icyName?: string;
  icyDescription?: string;
  icyGenre?: string;
  icyBitrate?: string;
  icySamplerate?: string;
  songTitle?: string;
  songArtist?: string;
  songAlbum?: string;
  songYear?: string;
  songGenre?: string;
}

// ID3v2 frame types
const ID3_FRAMES = {
  TIT2: "title",
  TPE1: "artist",
  TALB: "album",
  TYER: "year",
  TCON: "genre",
  APIC: "picture",
};

function parseID3v2(buffer: ArrayBuffer): Partial<StreamMetadata> {
  const view = new DataView(buffer);
  const metadata: Partial<StreamMetadata> = {};

  // Check for ID3v2 header
  if (view.getUint32(0) === 0x494433) {
    const version = view.getUint8(3);
    const size = view.getUint32(4) & 0x7fffffff;
    let offset = 10;

    while (offset < size) {
      const frameId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );

      const frameSize = view.getUint32(offset + 4);
      const frameFlags = view.getUint16(offset + 8);
      offset += 10;

      if (frameId in ID3_FRAMES) {
        const frameData = buffer.slice(offset, offset + frameSize);
        const textDecoder = new TextDecoder("utf-8");

        switch (frameId) {
          case "TIT2":
            metadata.songTitle = textDecoder.decode(frameData);
            break;
          case "TPE1":
            metadata.songArtist = textDecoder.decode(frameData);
            break;
          case "TALB":
            metadata.songAlbum = textDecoder.decode(frameData);
            break;
          case "TYER":
            metadata.songYear = textDecoder.decode(frameData);
            break;
          case "TCON":
            metadata.songGenre = textDecoder.decode(frameData);
            break;
          case "APIC":
            // Handle APIC frame (picture)
            const frameArray = new Uint8Array(frameData);
            const nullIndex = frameArray.indexOf(0);
            if (nullIndex !== -1) {
              const mimeType = textDecoder.decode(
                frameArray.slice(0, nullIndex)
              );
              const imageData = frameArray.slice(nullIndex + 1);
              metadata.artwork = URL.createObjectURL(
                new Blob([imageData], { type: mimeType })
              );
            }
            break;
        }
      }

      offset += frameSize;
    }
  }

  return metadata;
}

function parseADTS(buffer: ArrayBuffer): Partial<StreamMetadata> {
  const view = new DataView(buffer);
  const metadata: Partial<StreamMetadata> = {};

  // Check for ADTS header
  if ((view.getUint16(0) & 0xfff6) === 0xfff0) {
    const sampleRate = view.getUint16(2) & 0x3c0;
    const bitrate = view.getUint32(2) & 0x1ffc00;

    metadata.icySamplerate = sampleRate.toString();
    metadata.icyBitrate = bitrate.toString();
  }

  return metadata;
}

export function RadioPlayer() {
  const [currentStation] = useAtom(currentStationAtom);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(
    null
  );
  const [metadata, setMetadata] = useState<StreamMetadata>({});

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "none";

      audioRef.current.addEventListener("metadata", (e: any) => {
        if (e.data) {
          setMetadata((prev: StreamMetadata) => ({
            ...prev,
            icyName: e.data.icymetadata?.name,
            icyDescription: e.data.icymetadata?.description,
            icyGenre: e.data.icymetadata?.genre,
            icyBitrate: e.data.icymetadata?.bitrate,
            icySamplerate: e.data.icymetadata?.samplerate,
          }));
        }
      });

      audioRef.current.addEventListener("titleupdate", (e: any) => {
        if (e.data) {
          setMetadata((prev: StreamMetadata) => ({
            ...prev,
            title: e.data.title,
          }));
        }
      });
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle stream URL resolution and playback
  useEffect(() => {
    if (!currentStation || !audioRef.current) return;

    const primaryStream =
      currentStation.streams.find((s: any) => s.primary) ||
      currentStation.streams[0];
    if (!primaryStream) return;

    const loadStream = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setMetadata({}); // Reset metadata when changing streams

        const resolvedUrl = await resolveStreamUrl(primaryStream.url);
        setResolvedStreamUrl(resolvedUrl);

        audioRef.current!.src = resolvedUrl;

        if (isPlaying) {
          await audioRef.current!.play();
        }
      } catch (error) {
        console.error("Error loading stream:", error);
        setError("Failed to load audio stream");
        setIsPlaying(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadStream();
  }, [currentStation]);

  // Handle play/pause state
  useEffect(() => {
    if (!audioRef.current || !resolvedStreamUrl) return;

    if (isPlaying) {
      audioRef.current.play().catch((error) => {
        console.error("Error playing stream:", error);
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, resolvedStreamUrl]);

  const resolveStreamUrl = async (url: string): Promise<string> => {
    const isPlaylist = /\.(pls|m3u|m3u8|asx)$/i.test(url);

    if (!isPlaylist) {
      return url;
    }

    try {
      const response = await fetch(url);
      const content = await response.text();

      if (url.toLowerCase().endsWith(".pls")) {
        const match = content.match(/File1=(.*)/i);
        if (match && match[1]) {
          return match[1].trim();
        }
      } else if (
        url.toLowerCase().endsWith(".m3u") ||
        url.toLowerCase().endsWith(".m3u8")
      ) {
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith("#")) {
            return trimmedLine;
          }
        }
      }

      console.warn("Could not extract stream URL from playlist:", url);
      return url;
    } catch (error) {
      console.error("Error resolving playlist URL:", error);
      return url;
    }
  };

  const handlePlayPause = () => {
    if (currentStation) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkipForward = () => {
    // if (currentIndex === -1) return;
    // const nextIndex = (currentIndex + 1) % stations.length;
    // setCurrentStation(stations[nextIndex]);
  };

  const handleSkipBack = () => {
    // if (currentIndex === -1) return;
    // const prevIndex = (currentIndex - 1 + stations.length) % stations.length;
    // setCurrentStation(stations[prevIndex]);
  };

  const primaryStream =
    currentStation?.streams.find((s: any) => s.primary) ||
    currentStation?.streams[0];

  const handleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.volume = value[0] / 100;
      setVolume(value[0] / 100);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handlePreviousStation = () => {
    // if (currentIndex === -1) return;
    // const prevIndex = (currentIndex - 1 + stations.length) % stations.length;
    // setCurrentStation(stations[prevIndex]);
  };

  const handleNextStation = () => {
    // if (currentIndex === -1) return;
    // const nextIndex = (currentIndex + 1) % stations.length;
    // setCurrentStation(stations[nextIndex]);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-36 items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePlayPause}
              disabled={isLoading || !currentStation}
            >
              {isPlaying ?
                <Pause className="h-4 w-4" />
              : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleSkipForward}
              disabled={isLoading || !currentStation}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            {audioRef.current && (
              <MusicRecognitionButton audioElement={audioRef.current} />
            )}
          </div>
          <div className="grow min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-primary font-press-start-2p truncate">
              {currentStation?.name || "No station selected"}
            </h3>
            <p className="text-xs text-muted-foreground font-press-start-2p mt-1 truncate">
              {currentStation ?
                currentStation.description
              : "Select a station to play"}
            </p>
            {currentStation && (
              <div className="hidden sm:block mt-1 space-y-1">
                <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                  <span className="font-semibold">Genre:</span>{" "}
                  {currentStation.tags.find((t) => t[0] === "genre")?.[1] ||
                    "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                  <span className="font-semibold">Bitrate:</span>{" "}
                  {primaryStream?.quality.bitrate ?
                    `${Math.round(primaryStream.quality.bitrate / 1000)}`
                  : "Unknown"}{" "}
                  kbps
                </p>
                {metadata.songTitle && (
                  <p className="text-xs text-muted-foreground font-press-start-2p truncate flex items-center gap-1">
                    <Music className="h-3 w-3" />
                    <span className="font-semibold">Now Playing:</span>{" "}
                    {metadata.songTitle}
                  </p>
                )}
                {metadata.songArtist && (
                  <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                    <span className="font-semibold">Artist:</span>{" "}
                    {metadata.songArtist}
                  </p>
                )}
                {metadata.songAlbum && (
                  <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                    <span className="font-semibold">Album:</span>{" "}
                    {metadata.songAlbum}
                  </p>
                )}
                {metadata.icyName && (
                  <p className="text-xs text-muted-foreground font-press-start-2p truncate">
                    <span className="font-semibold">Stream Info:</span>{" "}
                    {metadata.icyName}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end space-y-1">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipBack}
                disabled={!currentStation}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleMute}
                disabled={!currentStation}
              >
                {isMuted ?
                  <VolumeX className="h-4 w-4" />
                : <Volume2 className="h-4 w-4" />}
              </Button>
            </div>
            {currentStation && (
              <a
                href={currentStation.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline font-press-start-2p hidden sm:inline-block"
              >
                Visit Website
              </a>
            )}
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={currentStation?.streams.find((s: any) => s.primary)?.url || ""}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
        onError={(e) => {
          console.error("Audio error:", e);
          setError("Failed to load audio stream");
        }}
        onLoadStart={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
      />
    </div>
  );
}
