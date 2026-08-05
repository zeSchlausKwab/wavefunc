// Canonical applesauce-react reactivity for admin feature events.

import type { Filter } from "applesauce-core/helpers/filter";
import { useMemo } from "react";
import { ADMIN_PUBKEYS } from "../../config/admins";
import {
  getAdminFeatureLabel,
  parseAdminFeatureEvent,
  type AdminFeatureType,
} from "../nostr/domain";
import { useAppDataTimeline } from "../nostr/hooks/useRelayTimeline";

/**
 * Subscribe to admin feature events of a given type.
 * Only events authored by ADMIN_PUBKEYS are returned.
 */
export function useAdminFeatures(type: AdminFeatureType) {
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

  const { events: rawEvents, isLoading } = useAppDataTimeline(filters);

  const features = useMemo(
    () => rawEvents.map((event) => parseAdminFeatureEvent(event)),
    [rawEvents],
  );

  return { features, isLoading };
}
