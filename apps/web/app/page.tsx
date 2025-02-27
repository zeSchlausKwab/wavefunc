"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { StationGroup } from "./components/StationGroup";
import { useAtom } from "jotai";
import { stationsAtom, groupsAtom } from "./atoms/stations";
import { Station } from "@wavefunc/common";

export default function Home() {
  const [stations, setStations] = useAtom(stationsAtom);
  const [groups] = useAtom(groupsAtom);

  const handleUpdateStation = (updatedStation: Station) => {
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
                .map((id) => stations.find((s) => s.id === String(id)))
                .filter(Boolean) as Station[]
            }
            onUpdateStation={handleUpdateStation}
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
