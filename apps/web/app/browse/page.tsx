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
import { RadioBrowserSearch } from "../components/radio/RadioBrowserSearch";

export default function BrowsePage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold font-press-start-2p">Browse</h1>
      <RadioBrowserSearch />
    </div>
  );
}
