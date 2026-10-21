import { useEffect, useState } from "react";
import { RelayPool } from "applesauce-relay";
import { BehaviorSubject, Subscription } from "rxjs";
import { createOutboxTimelineLoader } from "applesauce-loaders/loaders";
import { useAccountOptions } from "../../../config/accountOptions";
import {
  getIdentityRelayUrls,
  getRelayPolicy,
  getSocialRelayUrls,
} from "../../../config/nostr";
import { eventStore, relayLiveness, relayPool } from "../store";
import { selectAuthorOutboxes } from "../relayDiscovery";
import type { NostrEvent } from "applesauce-core/helpers/event";

/** Supplement the app feed for known participants, never scan unrelated authors. */
export function useCommunityOutboxes(
  pubkey: string | null,
  events: NostrEvent[],
  since: number,
) {
  const enabled =
    useAccountOptions(pubkey).discoverOutboxes &&
    getRelayPolicy().stage === "production";
  const authors = [...new Set(events.map((event) => event.pubkey))]
    .sort()
    .slice(0, 100);
  const key = authors.join(",");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (!enabled || !authors.length) return;
    const subscriptions = new Subscription();
    const discoveryPool = new RelayPool();
    subscriptions.add(() => discoveryPool.close());
    const fail = () =>
      setError(
        "Some author outboxes could not be loaded. The app relay feed is still available.",
      );
    let started = false;
    const start = () => {
      if (started || subscriptions.closed) return;
      started = true;
      const outboxes = selectAuthorOutboxes(
        authors,
        (key) => eventStore.getReplaceable(10002, key),
        getSocialRelayUrls(),
        (url) => !relayLiveness.isInBackoff(url),
      );
      if (!Object.keys(outboxes).length) {
        fail();
        return;
      }
      const boundary = Math.floor(Date.now() / 1000);
      const filter = { kinds: [1, 1111], "#t": ["wavefunc"] };
      const windows = new BehaviorSubject({ since, until: boundary });
      const loader = createOutboxTimelineLoader(
        discoveryPool,
        outboxes,
        filter,
        { eventStore, liveness: relayLiveness, limit: 100, prefetch: 25 },
      );
      subscriptions.add(
        loader.status$.subscribe((statuses) => {
          if (statuses.some((s) => s.state === "incomplete")) fail();
        }),
      );
      subscriptions.add(loader(windows).subscribe({ error: fail }));
      subscriptions.add(
        discoveryPool
          .outboxSubscription(
            outboxes,
            { ...filter, since: boundary },
            { waitForAuth: false },
          )
          .subscribe({ next: (event) => eventStore.add(event), error: fail }),
      );
      subscriptions.add(() => windows.complete());
    };
    subscriptions.add(
      relayPool
        .request(
          getIdentityRelayUrls().slice(0, 3),
          [{ kinds: [10002], authors, limit: 100 }],
          { timeout: 6000, waitForAuth: false },
        )
        .subscribe({
          next: (event) => eventStore.add(event),
          complete: start,
          error: () => {
            fail();
            start();
          },
        }),
    );
    return () => subscriptions.unsubscribe();
  }, [pubkey, enabled, key, since]);
  return error;
}
