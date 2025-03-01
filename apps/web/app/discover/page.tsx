"use client";

import { useEffect, useState } from "react";
import { NDKEvent, NDKUser } from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";
import { RelayDebugger } from "../components/debug/RelayDebugger";
import {
  subscribeToRadioStations,
  parseRadioEvent,
  Station,
  RADIO_EVENT_KINDS,
} from "@wavefunc/common";
import { ExpandableStationCard } from "../components/station/ExpandableStationCard";

export default function DiscoverPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [currentUser, setCurrentUser] = useState<NDKUser | null>(null);
  const [deletedStationIds, setDeletedStationIds] = useState<Set<string>>(
    new Set()
  );

  // Get the current user once
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await nostrService.getNDK().signer?.user();
        if (user) {
          setCurrentUser(user);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };

    fetchUser();
  }, []);

  // Subscribe to deletion events (kind 5)
  useEffect(() => {
    const ndk = nostrService.getNDK();
    const sub = ndk.subscribe(
      {
        kinds: [5], // Deletion events
      },
      { closeOnEose: false }
    );

    sub.on("event", (event: NDKEvent) => {
      // Find 'e' tags which reference the IDs of events to be deleted
      const deletedIds = event.tags
        .filter((tag) => tag[0] === "e")
        .map((tag) => tag[1]);

      if (deletedIds.length > 0) {
        // Add deleted IDs to our set
        setDeletedStationIds((prev) => {
          const newSet = new Set(prev);
          deletedIds.forEach((id) => newSet.add(id));
          return newSet;
        });

        // Remove deleted stations from our state
        setStations((prev) =>
          prev.filter((station) => !deletedIds.includes(station.id))
        );
      }
    });

    return () => {
      sub.stop();
    };
  }, []);

  useEffect(() => {
    const sub = subscribeToRadioStations(
      nostrService.getNDK(),
      (event: NDKEvent) => {
        if (deletedStationIds.has(event.id)) {
          return;
        }

        setStations((prev) => {
          const dTag = event.tags.find((t) => t[0] === "d");
          if (!dTag) {
            console.warn(
              "Received station without a d-tag, skipping:",
              event.id
            );
            return prev;
          }

          console.log(
            `Received station with d-tag: ${dTag[1]}, id: ${event.id}`
          );

          let naddr: string | undefined = undefined;
          try {
            naddr = `${RADIO_EVENT_KINDS.STREAM}:${event.pubkey}:${dTag[1]}`;
          } catch (e) {
            console.warn("Could not generate naddr identifier:", e);
          }

          const data = parseRadioEvent(event);
          const station: Station = {
            id: event.id,
            naddr,
            name: data.name,
            description: data.description,
            website: data.website,
            genre: event.tags.find((t) => t[0] === "genre")?.[1] || "",
            imageUrl: event.tags.find((t) => t[0] === "thumbnail")?.[1] || "",
            pubkey: event.pubkey,
            tags: event.tags,
            streams: data.streams,
            created_at: event.created_at || Math.floor(Date.now() / 1000),
          };

          // Check if this is a replacement for an existing station
          // For replaceable events like radio stations, the d-tag is what matters, not the event ID
          const existingStationIndex = prev.findIndex((s) => {
            // If we have a full match by ID, that's the simplest case
            if (s.id === event.id) return true;

            // Check if it's a replaceable event with the same d-tag and pubkey
            if (s.tags && dTag) {
              const existingDTag = s.tags.find((t) => t[0] === "d");
              // Same d-tag and same pubkey means it's the same station
              return (
                existingDTag &&
                existingDTag[1] === dTag[1] &&
                s.pubkey === event.pubkey
              );
            }

            return false;
          });

          if (existingStationIndex >= 0) {
            console.log(
              `Updating existing station at index ${existingStationIndex} with d-tag: ${dTag[1]}`
            );
            // Replace the station and maintain sorting
            const newStations = [...prev];
            newStations[existingStationIndex] = station;
            return newStations.sort((a, b) => b.created_at - a.created_at);
          } else {
            console.log(`Adding new station with d-tag: ${dTag[1]}`);
            // Add the new station
            return [...prev, station].sort(
              (a, b) => b.created_at - a.created_at
            );
          }
        });
      }
    );

    return () => {
      sub.stop();
    };
  }, [currentUser, deletedStationIds]);

  const handleStationUpdate = (updatedStation: Station) => {
    // Update local state when a station is updated
    setStations((prev) =>
      prev.map((station) =>
        station.id === updatedStation.id ? updatedStation : station
      )
    );
  };

  const handleStationDelete = (stationId: string) => {
    // Remove the deleted station from the UI
    setStations((prev) => prev.filter((station) => station.id !== stationId));

    // Add to deleted IDs set
    setDeletedStationIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(stationId);
      return newSet;
    });
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
            onDelete={handleStationDelete}
          />
        ))}
      </div>
      <RelayDebugger />
    </div>
  );
}
