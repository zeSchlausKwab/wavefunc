// Canonical applesauce-react reactivity for admin feature events.

import { TimelineModel } from "applesauce-core/models";
import type { Filter } from "applesauce-core/helpers/filter";
import { useEventModel } from "applesauce-react/hooks";
import { useEffect, useMemo, useState } from "react";
import { ADMIN_PUBKEYS } from "../../config/admins";
import { getAppDataRelayUrls } from "../../config/nostr";
import {
  getAdminFeatureLabel,
  parseAdminFeatureEvent,
  type AdminFeatureType,
} from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";
import { requestEventsIntoStore } from "../nostr/requestEvents";

/**
 * Subscribe to admin feature events of a given type.
 * Only events authored by ADMIN_PUBKEYS are returned.
 */
export function useAdminFeatures(type: AdminFeatureType) {
  const { eventStore, relayPool } = useWavefuncNostr();

  const filters: Filter[] = useMemo(
    () => [
      {
        kinds: [30078],
        authors: ADMIN_PUBKEYS,
        "#l": [getAdminFeatureLabel(type)],
      },
    ],
    [type],
  );

  const [eose, setEose] = useState(false);
  useEffect(() => {
    setEose(false);
    const requestSubscription = requestEventsIntoStore(
      relayPool,
      eventStore,
      getAppDataRelayUrls(),
      filters,
    ).subscribe({
      complete: () => setEose(true),
      error: () => setEose(true),
    });
    return () => requestSubscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  const rawEvents = useEventModel(TimelineModel, [filters]) ?? [];

  const features = useMemo(
    () => rawEvents.map((event) => parseAdminFeatureEvent(event)),
    [rawEvents],
  );

  return { features, isLoading: !eose };
}
