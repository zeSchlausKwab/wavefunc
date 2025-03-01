"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Station, Stream } from "@wavefunc/common";
import { useSetAtom } from "jotai";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Globe,
  Heart,
  MessageCircle,
  Music,
  Pencil,
  Play,
  Share2,
  Star,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import React from "react";
import { currentStationAtom, isPlayingAtom } from "../../atoms/stations";
import { openEditStationDrawer } from "../../atoms/ui";
import { StreamSelector } from "./StreamSelector";
import { nostrService } from "@/services/ndk";
import { NDKUser } from "@nostr-dev-kit/ndk";

interface ExpandableStationCardProps {
  station: Station;
  onUpdate?: (updatedStation: Station) => void;
  onDelete?: (stationId: string) => void;
}

export function ExpandableStationCard({
  station,
  onUpdate,
  onDelete,
}: ExpandableStationCardProps) {
  const setCurrentStation = useSetAtom(currentStationAtom);
  const setIsPlaying = useSetAtom(isPlayingAtom);
  const openEditDrawer = useSetAtom(openEditStationDrawer);

  const [isExpanded, setIsExpanded] = React.useState(false);
  const [user, setUser] = React.useState<NDKUser | null>(null);
  // const stationStreams = React.useMemo(
  //   () => streams.filter((stream) => stream.stationId === Number(station.id)),
  //   [station.id]
  // );

  React.useEffect(() => {
    const getUser = async () => {
      const user = await nostrService.getNDK().signer?.user();
      if (user) {
        setUser(user);
      }
    };
    getUser();
  }, [station.pubkey]);

  // const stationComments = React.useMemo(
  //   () =>
  //     comments.filter((comment: any) =>
  //       // Handle both Comment types (with or without stationId)
  //       "stationId" in comment ?
  //         comment.stationId === Number(station.id)
  //       : false
  //     ),
  //   [station.id]
  // );

  const [selectedStreamId, setSelectedStreamId] = React.useState<
    number | undefined
  >(undefined);

  const handleStreamSelect = (stream: Stream) => {
    setSelectedStreamId(stream.id);
  };

  const handlePlay = () => {
    setCurrentStation(station);
    setIsPlaying(true);
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
                  <StreamSelector
                    stationId={Number(station.id)}
                    onStreamSelect={handleStreamSelect}
                    selectedStreamId={selectedStreamId}
                  />
                  <Button variant="ghost" size="icon" onClick={handlePlay}>
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
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex space-x-2">
                <Button variant="ghost" size="icon" asChild>
                  {/* <a
                    href={
                      stationStreams.find((s) => s.id === selectedStreamId)
                        ?.url || "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Visit Website"
                  >
                    <Globe className="h-4 w-4 text-primary" />
                  </a> */}
                </Button>
                <Button variant="ghost" size="icon" aria-label="Flash">
                  <Zap className="h-4 w-4 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Flash">
                  <Heart className="h-4 w-4 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Comment">
                  <MessageCircle className="h-4 w-4 text-primary" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Share">
                  <Share2 className="h-4 w-4 text-primary" />
                </Button>
              </div>
              {station.pubkey === user?.pubkey && (
                <Button
                  onClick={() => openEditDrawer(station)}
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
              {/* {stationComments.map((comment) => (
                <div key={comment.id} className="bg-white p-2 rounded-md">
                  <p className="text-xs font-press-start-2p">{comment.text}</p>
                  <p className="text-xs text-gray-500 font-press-start-2p mt-1">
                    {comment.user} - {comment.date}
                  </p>
                </div>
              ))} */}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
