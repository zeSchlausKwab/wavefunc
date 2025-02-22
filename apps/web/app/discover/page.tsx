"use client";

import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";
import { RelayDebugger } from "../components/RelayDebugger";
import {
  subscribeToRadioStations,
  parseRadioEvent,
} from "@wavefunc/common/src/nostr/radio";
import { ExpandableStationCard } from "../components/ExpandableStationCard";
import { Station } from "@wavefunc/common";

export default function DiscoverPage() {
  const [stations, setStations] = useState<NDKEvent[]>([]);

  useEffect(() => {
    const sub = subscribeToRadioStations(nostrService.getNDK(), (event) => {
      setStations((prev) => {
        const exists = prev.some((e) => e.id === event.id);
        if (!exists) {
          return [...prev, event].sort(
            (a, b) => (b.created_at || 0) - (a.created_at || 0)
          );
        }
        return prev;
      });
    });

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
        {stations.map((station) => {
          const data = parseRadioEvent(station);
          return (
            <ExpandableStationCard
              key={station.id}
              station={{
                id: station.id,
                name: data.name,
                description: data.description,
                genre: data.tags.find((t) => t[0] === "genre")?.[1] || "",
                imageUrl: data.tags.find((t) => t[0] === "thumbnail")?.[1],
                website: data.website,
                isUserOwned: false, // TODO: Implement ownership check
                streamIds: [], // TODO: Implement stream IDs
                commentIds: [], // TODO: Implement comment IDs
              }}
              onUpdate={handleStationUpdate}
            />
          );
        })}
      </div>
      <RelayDebugger />
    </div>
  );
}
