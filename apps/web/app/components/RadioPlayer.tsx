"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pause, Play, SkipBack, SkipForward, Music } from "lucide-react";
import { useAtom } from "jotai";
import { currentStationAtom, isPlayingAtom } from "../atoms/stations";
import { useEffect, useRef, useState } from "react";

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
  const [currentStation, setCurrentStation] = useAtom(currentStationAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(
    null
  );
  const [metadata, setMetadata] = useState<StreamMetadata>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = "none";

    console.log("audioRef.current", audioRef.current);

    if (audioRef.current) {
      audioRef.current.addEventListener("metadata", (e: any) => {
        console.log("metadata", e);
        if (e.data) {
          setMetadata((prev) => ({
            ...prev,
            icyName: e.data.icymetadata?.name,
            icyDescription: e.data.icymetadata?.description,
            icyGenre: e.data.icymetadata?.genre,
            icyBitrate: e.data.icymetadata?.bitrate,
            icySamplerate: e.data.icymetadata?.samplerate,
          }));
        }
      });

      // Handle title updates
      audioRef.current.addEventListener("titleupdate", (e: any) => {
        if (e.data) {
          setMetadata((prev) => ({
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

  useEffect(() => {
    if (!currentStation || !audioRef.current) return;

    const primaryStream =
      currentStation.streams.find((s: any) => s.primary) ||
      currentStation.streams[0];

    if (primaryStream) {
      setResolvedStreamUrl(null);
      setMetadata({}); // Reset metadata when changing streams

      resolveStreamUrl(primaryStream.url)
        .then((resolvedUrl) => {
          setResolvedStreamUrl(resolvedUrl);
          audioRef.current!.src = resolvedUrl;

          if (isPlaying) {
            audioRef.current!.play().catch((error) => {
              console.error("Error playing stream:", error);
              setIsPlaying(false);
            });
          }
        })
        .catch((error) => {
          console.error("Error resolving stream URL:", error);
          setIsPlaying(false);
        });
    }
  }, [currentStation]);

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

  return (
    <Card className="w-full bg-white shadow-lg border-t border-gray-200">
      <CardContent className="p-2 sm:p-4">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 shrink-0">
            <Image
              src={
                currentStation?.tags.find((t) => t[0] === "thumbnail")?.[1] ||
                "https://picsum.photos/seed/no-station/200/200"
              }
              alt={currentStation?.name || "No station selected"}
              fill
              style={{ objectFit: "cover" }}
              className="rounded-md"
            />
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
                onClick={handlePlayPause}
                disabled={!currentStation}
              >
                {isPlaying ?
                  <Pause className="h-4 w-4" />
                : <Play className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleSkipForward}
                disabled={!currentStation}
              >
                <SkipForward className="h-4 w-4" />
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
      </CardContent>
    </Card>
  );
}
