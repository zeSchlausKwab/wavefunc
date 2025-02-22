"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useAtom } from "jotai";
import {
  currentStationAtom,
  isPlayingAtom,
  stationsAtom,
} from "../atoms/stations";
import { useEffect, useRef } from "react";

export function RadioPlayer() {
  const [stations] = useAtom(stationsAtom);
  const [currentStation, setCurrentStation] = useAtom(currentStationAtom);
  const [isPlaying, setIsPlaying] = useAtom(isPlayingAtom);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentIndex =
    currentStation ? stations.findIndex((s) => s.id === currentStation.id) : -1;

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.preload = "none";

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!currentStation || !audioRef.current) return;

    const primaryStream =
      currentStation.streams.find((s: any) => s.primary) ||
      currentStation.streams[0];

    if (primaryStream) {
      audioRef.current.src = primaryStream.url;
      if (isPlaying) {
        audioRef.current.play().catch((error) => {
          console.error("Error playing stream:", error);
          setIsPlaying(false);
        });
      }
    }
  }, [currentStation, isPlaying]);

  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch((error) => {
        console.error("Error playing stream:", error);
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const handlePlayPause = () => {
    if (currentStation) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSkipForward = () => {
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % stations.length;
    setCurrentStation(stations[nextIndex]);
  };

  const handleSkipBack = () => {
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + stations.length) % stations.length;
    setCurrentStation(stations[prevIndex]);
  };

  // Get current station data directly
  const primaryStream =
    currentStation?.streams.find((s: any) => s.primary) ||
    currentStation?.streams[0];

  return (
    <Card className="w-full bg-white shadow-lg border-t border-gray-200">
      <CardContent className="p-2 sm:p-4">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0">
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
          <div className="flex-grow min-w-0">
            <h3 className="text-xs sm:text-sm font-semibold text-primary font-press-start-2p truncate">
              {currentStation?.name || "No station selected"}
            </h3>
            <p className="text-xs text-muted-foreground font-press-start-2p mt-1 truncate">
              {currentStation ?
                currentStation.description
              : "Select a station to play"}
            </p>
            {currentStation && (
              <div className="hidden sm:block mt-1">
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
