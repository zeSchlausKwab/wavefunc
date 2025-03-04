"use client";

import { Button } from "@/components/ui/button";
import { Station } from "@wavefunc/common";
import { useAtom } from "jotai";
import Link from "next/link";
import { FavoritesManager } from "./components/favorites/FavoritesManager";
// import { groupsAtom } from "./atoms/stations";

export default function Home() {
  // const [stations, setStations] = useAtom(stationsAtom);
  // const [groups] = useAtom(groupsAtom);

  const handleUpdateStation = (updatedStation: Station) => {
    // setStations(
    //   stations.map((station) =>
    //     station.id === updatedStation.id ? updatedStation : station
    //   )
    // );
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold font-press-start-2p text-primary mb-8">
        Nostr Radio
      </h1>

      <FavoritesManager />
    </main>
  );
}
