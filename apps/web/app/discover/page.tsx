"use client";

import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";
import { RelayDebugger } from "../components/debug/RelayDebugger";
import {
  subscribeToRadioStations,
  parseRadioEvent,
  Station,
} from "@wavefunc/common";
import { ExpandableStationCard } from "../components/station/ExpandableStationCard";

export default function DiscoverPage() {
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    const sub = subscribeToRadioStations(
      nostrService.getNDK(),
      (event: NDKEvent) => {
        setStations((prev) => {
          const exists = prev.some((e) => e.id === event.id);
          if (!exists) {
            const data = parseRadioEvent(event);
            const station: Station = {
              id: event.id,
              name: data.name,
              description: data.description,
              website: data.website,
              genre: event.tags.find((t) => t[0] === "genre")?.[1] || "",
              imageUrl: event.tags.find((t) => t[0] === "thumbnail")?.[1] || "",
              pubkey: event.pubkey,
              tags: event.tags,
              streams: data.streams,
              created_at: event.created_at || Math.floor(Date.now() / 1000),
              isUserOwned: false,
            };
            return [...prev, station].sort(
              (a, b) => b.created_at - a.created_at
            );
          }
          return prev;
        });
      }
    );

    return () => {
      sub.stop();
    };
  }, []);

  const handleStationUpdate = (updatedStation: Station) => {
    // TODO: Implement station update logic
    console.log("Station updated:", updatedStation);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold font-press-start-2p">Discover</h1>
      <div className="grid grid-cols-1 gap-6">
        {stations.map((station) => (
          <ExpandableStationCard
            key={station.id}
            station={station}
            onUpdate={handleStationUpdate}
          />
        ))}
      </div>
      <RelayDebugger />
    </div>
  );
}
