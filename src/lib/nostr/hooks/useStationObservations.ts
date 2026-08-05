import type { Filter } from "applesauce-core/helpers/filter";
import { useMemo } from "react";

import { config } from "../../../config/env";
import {
  parseStationHealthEvent,
  parseStationRankingEvent,
  parseStationTrackEvent,
  STATION_HEALTH_KIND,
  STATION_NOW_PLAYING_KIND,
  STATION_RANKING_KIND,
  type StationHealthSummary,
  type StationRankingMetric,
  type StationRankingSnapshot,
  type StationTrack,
} from "../domain";
import { useAppDataTimeline } from "./useRelayTimeline";

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function useStationRankings() {
  const filters = useMemo<Filter[]>(
    () => [
      {
        kinds: [STATION_RANKING_KIND],
        authors: [config.metadataServerPubkey],
      },
    ],
    [],
  );
  const { events, isLoading, error } = useAppDataTimeline(filters);
  const rankings = useMemo(() => {
    const byMetric = new Map<StationRankingMetric, StationRankingSnapshot>();
    for (const event of [...events].sort((a, b) => b.created_at - a.created_at)) {
      if (event.pubkey !== config.metadataServerPubkey) continue;
      const ranking = parseStationRankingEvent(event);
      if (ranking && !byMetric.has(ranking.metric)) {
        byMetric.set(ranking.metric, ranking);
      }
    }
    return byMetric;
  }, [events]);
  return { rankings, isLoading, error };
}

function observationFilters(kind: number, stationAddresses: string[]): Filter[] {
  const addresses = Array.from(new Set(stationAddresses.filter(Boolean)));
  return chunk(addresses, 200).map((addressChunk) => ({
    kinds: [kind],
    authors: [config.metadataServerPubkey],
    "#a": addressChunk,
  }));
}

export function useStationHealth(stationAddresses: string[]) {
  const key = JSON.stringify(stationAddresses);
  const filters = useMemo(
    () => observationFilters(STATION_HEALTH_KIND, stationAddresses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const { events, isLoading, error } = useAppDataTimeline(
    filters.length > 0 ? filters : null,
  );
  const byAddress = useMemo(() => {
    const result = new Map<string, StationHealthSummary>();
    for (const event of [...events].sort((a, b) => b.created_at - a.created_at)) {
      if (event.pubkey !== config.metadataServerPubkey) continue;
      const health = parseStationHealthEvent(event);
      if (health && !result.has(health.stationAddress)) {
        result.set(health.stationAddress, health);
      }
    }
    return result;
  }, [events]);
  return { byAddress, isLoading, error };
}

export function useCurrentStationTracks(stationAddresses: string[]) {
  const key = JSON.stringify(stationAddresses);
  const filters = useMemo(
    () => observationFilters(STATION_NOW_PLAYING_KIND, stationAddresses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const { events, isLoading, error } = useAppDataTimeline(
    filters.length > 0 ? filters : null,
  );
  const byAddress = useMemo(() => {
    const result = new Map<string, StationTrack>();
    const now = Math.floor(Date.now() / 1000);
    for (const event of [...events].sort((a, b) => b.created_at - a.created_at)) {
      if (event.pubkey !== config.metadataServerPubkey) continue;
      const track = parseStationTrackEvent(event, now);
      if (track && !result.has(track.stationAddress)) {
        result.set(track.stationAddress, track);
      }
    }
    return result;
  }, [events]);
  return { byAddress, isLoading, error };
}
