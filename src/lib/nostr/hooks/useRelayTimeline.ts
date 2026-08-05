import type { Filter } from "applesauce-core/helpers/filter";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { TimelineModel } from "applesauce-core/models";
import { useEventModel } from "applesauce-react/hooks";
import { useMemo, useSyncExternalStore } from "react";
import {
  getAppDataRelayUrls,
  getNostrCacheScope,
} from "../../../config/nostr";
import { relayQueries } from "../store";
import type { RelayQuerySnapshot } from "../queryRegistry";

const READY: RelayQuerySnapshot = { ready: true, source: "memory" };
const subscribeNoop = () => () => undefined;
const getReadySnapshot = () => READY;

type RelayTimelineOptions = {
  filters: Filter[] | null | false;
  relays: string[];
  scope?: string;
  /** Filters used for the local TimelineModel when relay-only fields such as
   * NIP-50 `search` must be removed. */
  readFilters?: Filter[];
};

export function useRelayTimeline({
  filters,
  relays,
  scope = getNostrCacheScope(),
  readFilters,
}: RelayTimelineOptions): {
  events: NostrEvent[];
  isLoading: boolean;
  error: Error | null;
} {
  const filtersKey = JSON.stringify(filters || []);
  const relaysKey = JSON.stringify(relays);
  const query = useMemo(
    () =>
      filters && filters.length > 0
        ? relayQueries.query({ scope, relays, filters })
        : null,
    // Canonical keys intentionally prevent object-identity remounts from
    // opening duplicate relay requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, relaysKey, filtersKey],
  );

  const snapshot: RelayQuerySnapshot = useSyncExternalStore(
    query?.subscribe ?? subscribeNoop,
    query?.getSnapshot ?? getReadySnapshot,
    query?.getSnapshot ?? getReadySnapshot,
  );

  const modelFilters = readFilters ?? (filters || null);
  const events =
    useEventModel(
      TimelineModel,
      modelFilters && modelFilters.length > 0 ? [modelFilters] : null,
    ) ?? [];

  return {
    events,
    isLoading: !snapshot.ready,
    error: snapshot.error ?? null,
  };
}

export function useAppDataTimeline(
  filters: Filter[] | null | false,
  readFilters?: Filter[],
) {
  return useRelayTimeline({
    filters,
    readFilters,
    relays: getAppDataRelayUrls(),
  });
}
