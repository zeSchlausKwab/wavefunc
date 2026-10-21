import { useEffect, useMemo, useState } from "react";
import { BehaviorSubject } from "rxjs";
import { createTimelineLoader, type TimelineWindow } from "applesauce-loaders/loaders";
import { TimelineModel } from "applesauce-core/models";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$, useEventModel } from "applesauce-react/hooks";
import { eventCache, eventStore, relayLiveness, relayPool } from "../store";
import { getNostrCacheScope } from "../../../config/nostr";

const WEEK = 7 * 24 * 60 * 60;

/** One history session follows a finite expanding window; a separate leg delivers new events. */
export function useWindowedTimeline(filters: Filter[], relays: string[]) {
  const [boundary] = useState(() => Math.floor(Date.now() / 1000));
  const [window, setWindow] = useState<TimelineWindow>({ since: Math.max(0, boundary - WEEK), until: boundary });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const resource = useMemo(() => ({
    windows: new BehaviorSubject(window),
    loader: createTimelineLoader(relayPool, relays, filters, {
      eventStore, limit: 100, prefetch: 25, liveness: relayLiveness,
      cache: filters => eventCache.query(getNostrCacheScope(), filters),
    }),
  }), [JSON.stringify(filters), JSON.stringify(relays), attempt]);
  const statuses = use$(resource.loader.status$);
  useEffect(() => { resource.windows.next(window); }, [resource, window]);
  useEffect(() => {
    setError(null);
    const fail = (error: unknown) => setError(error instanceof Error ? error : new Error(String(error)));
    const history = resource.loader(resource.windows).subscribe({ error: fail });
    const live = relayPool.subscription(relays, filters.map(filter => ({ ...filter, since: boundary })), { waitForAuth: false })
      .subscribe({ next: event => eventStore.add(event), error: fail });
    return () => { history.unsubscribe(); live.unsubscribe(); };
  }, [resource]);
  const modelFilters = filters.map(filter => ({ ...filter, since: window.since }));
  const events = useEventModel(TimelineModel<NostrEvent>, [modelFilters]) ?? [];
  return {
    events,
    isLoading: !error && (!statuses?.length || statuses.some(status => status.state === "loading")),
    incomplete: !!error || statuses?.some(status => status.state === "incomplete") || false,
    error,
    since: window.since,
    loadOlder: () => setWindow(current => ({ ...current, since: Math.max(0, current.since - WEEK) })),
    retry: () => { relays.forEach(url => relayLiveness.reset(url)); setAttempt(n => n + 1); },
  };
}
