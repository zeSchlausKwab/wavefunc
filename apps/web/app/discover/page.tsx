"use client";

import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";
import { RelayDebugger } from "../components/RelayDebugger";
import {
  subscribeToRadioStations,
  parseRadioEvent,
} from "@wavefunc/common/src/nostr/radio";
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

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Discover</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations.map((station) => {
          const data = parseRadioEvent(station);
          return (
            <div key={station.id} className="p-4 border rounded-lg">
              <h2 className="text-xl font-bold">{data.name}</h2>
              <p className="text-gray-600">{data.description}</p>
            </div>
          );
        })}
      </div>
      <RelayDebugger />
    </div>
  );
}
