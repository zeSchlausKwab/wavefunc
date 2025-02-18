"use client";

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Play,
  Pencil,
  ChevronDown,
  ChevronUp,
  Globe,
  Zap,
  Share2,
  Music,
  Users,
  Calendar,
  Star,
} from "lucide-react";
import { EditStationDrawer } from "./EditStationDrawer";
import { Station, Stream } from "@wavefunc/common";
import { streams } from "../data/streams";
import { comments } from "../data/comments";

interface ExpandableStationCardProps {
  station: Station;
  onUpdate: (updatedStation: Station) => void;
  onPlay: (station: Station) => void;
}

export function ExpandableStationCard({
  station,
  onUpdate,
  onPlay,
}: ExpandableStationCardProps) {
  const [isEditDrawerOpen, setIsEditDrawerOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const stationStreams = React.useMemo(
    () => streams.filter((stream) => stream.stationId === station.id),
    [station.id]
  );

  const stationComments = React.useMemo(
    () => comments.filter((comment) => comment.stationId === station.id),
    [station.id]
  );

  const [selectedStream, setSelectedStream] = React.useState<Stream | null>(
    stationStreams.length > 0 ? stationStreams[0] : null
  );

  const handleStreamChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newStream = stationStreams.find(
      (stream) => stream.url === event.target.value
    );
    if (newStream) setSelectedStream(newStream);
  };

  return (
    <Card className="w-full bg-white bg-opacity-90 shadow-lg overflow-hidden">
      <div className="flex flex-col">
        <div className="flex flex-col md:flex-row">
          <div
            className={`relative ${isExpanded ? "w-full md:w-64 h-64" : "w-full md:w-48 h-48"} transition-all duration-300`}
          >
            <Image
              src={station.imageUrl || "/placeholder.svg"}
              alt={station.name}
              fill
              style={{ objectFit: "cover" }}
              className="rounded-t-lg md:rounded-l-lg md:rounded-t-none"
            />
          </div>
          <div className="flex-grow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-primary text-sm font-press-start-2p">
                    {station.name}
                  </CardTitle>
                  <CardDescription className="text-xs font-press-start-2p mt-1">
                    {station.genre}
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onPlay(station)}
                  >
                    <Play className="h-4 w-4 text-primary" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsExpanded(!isExpanded)}
                  >
                    {isExpanded ?
                      <ChevronUp className="h-4 w-4 text-primary" />
                    : <ChevronDown className="h-4 w-4 text-primary" />}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-press-start-2p">
                {station.description}
              </p>
              {stationStreams && stationStreams.length > 0 && (
                <div className="mt-2 p-2 bg-gray-100 rounded">
                  <label
                    htmlFor="bitrate-select"
                    className="block text-xs font-press-start-2p mb-1"
                  >
                    Available Streams:
                  </label>
                  <select
                    id="bitrate-select"
                    value={selectedStream?.url}
                    onChange={handleStreamChange}
                    className="w-full text-xs font-press-start-2p bg-white border border-gray-300 rounded px-2 py-1"
                  >
                    {stationStreams.map((stream, index) => (
                      <option key={index} value={stream.url}>
                        {stream.bitrate} kbps
                      </option>
                    ))}
                  </select>
                  {selectedStream && (
                    <p className="text-xs font-press-start-2p mt-1">
                      Current: {selectedStream.bitrate} kbps
                    </p>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex space-x-2">
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={selectedStream?.url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Visit Website"
                  >
                    <Globe className="h-4 w-4 text-primary" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" aria-label="Flash">
                  <Zap className="h-4 w-4 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Share">
                  <Share2 className="h-4 w-4 text-primary" />
                </Button>
              </div>
              {station.isUserOwned && (
                <Button
                  onClick={() => setIsEditDrawerOpen(true)}
                  className="bg-secondary hover:bg-secondary-foreground text-primary hover:text-white font-press-start-2p text-xs"
                  size="sm"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
            </CardFooter>
          </div>
        </div>
        {isExpanded && (
          <div className="bg-gray-100 p-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 rounded-full bg-primary mr-3"></div>
              <div>
                <p className="text-sm font-semibold font-press-start-2p">
                  John Doe
                </p>
                <p className="text-xs text-gray-500 font-press-start-2p">
                  Station Creator
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center">
                <Music className="h-4 w-4 text-primary mr-2" />
                <span className="text-xs font-press-start-2p">
                  Tracks: 1000+
                </span>
              </div>
              <div className="flex items-center">
                <Users className="h-4 w-4 text-primary mr-2" />
                <span className="text-xs font-press-start-2p">
                  Listeners: 5k
                </span>
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 text-primary mr-2" />
                <span className="text-xs font-press-start-2p">Since: 2020</span>
              </div>
              <div className="flex items-center">
                <Star className="h-4 w-4 text-primary mr-2" />
                <span className="text-xs font-press-start-2p">Rating: 4.8</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold font-press-start-2p">
                Comments
              </h4>
              {stationComments.map((comment) => (
                <div key={comment.id} className="bg-white p-2 rounded-md">
                  <p className="text-xs font-press-start-2p">{comment.text}</p>
                  <p className="text-xs text-gray-500 font-press-start-2p mt-1">
                    {comment.user} - {comment.date}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <EditStationDrawer
        station={station}
        isOpen={isEditDrawerOpen}
        onClose={() => setIsEditDrawerOpen(false)}
        onUpdate={onUpdate}
      />
    </Card>
  );
}
