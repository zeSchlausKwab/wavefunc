"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StationGroup } from "./components/StationGroup";
import { stations as initialStations } from "./data/stations";
import { groups as initialGroups } from "./data/groups";
import { Station } from "@wavefunc/common";

export default function Home({ onPlayStation }) {
  const [stations, setStations] = useState(initialStations);
  const [groups, setGroups] = useState(initialGroups);

  const handleUpdateStation = (updatedStation) => {
    setStations(
      stations.map((station) =>
        station.id === updatedStation.id ? updatedStation : station
      )
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary font-press-start-2p">
        Your Radio Stations
      </h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <StationGroup
            key={group.id}
            name={group.name}
            description={group.description}
            stations={
              group.stationIds
                .map((id) => stations.find((s) => s.id === id))
                .filter(Boolean) as Station[]
            }
            onUpdateStation={handleUpdateStation}
            onPlayStation={onPlayStation}
          />
        ))}
      </div>
      <div className="text-center">
        <Button
          className="bg-primary hover:bg-primary-foreground text-white font-press-start-2p text-xs"
          asChild
        >
          <Link href="/add-station">Add New Station</Link>
        </Button>
      </div>
    </div>
  );
}
