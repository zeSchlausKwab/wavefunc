import { useMemo } from "react";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { map, scan, startWith } from "rxjs";
import { NDKWFAdminFeature, type AdminFeatureType } from "../NDKWFAdminFeature";
import { ADMIN_PUBKEYS } from "../../config/admins";
import { getAppDataRelayUrls } from "../../config/nostr";
import { useWavefuncNostr } from "../nostr/runtime";

/**
 * Subscribe to admin feature events of a given type.
 * Only events authored by ADMIN_PUBKEYS are returned.
 */
export function useAdminFeatures(type: AdminFeatureType) {
  const { eventStore, relayPool } = useWavefuncNostr();
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);
  const filters: Filter[] = useMemo(
    () => [
      {
        kinds: [30078],
        authors: ADMIN_PUBKEYS,
        "#l": [NDKWFAdminFeature.labelFor(type)],
      },
    ],
    [type]
  );
  const filtersKey = JSON.stringify(filters);

  const eose =
    use$(
      () =>
        relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        ),
      [eventStore, filtersKey, relayPool, relaysKey],
    ) ?? false;

  const events =
    use$(
      () => eventStore.timeline(filters).pipe(map((timeline) => [...timeline])),
      [eventStore, filtersKey],
    ) ?? [];

  const features = useMemo(() => {
    return events.map((event) => new NDKWFAdminFeature(undefined, event as any));
  }, [events]);

  return { features, isLoading: !eose };
}
