import { useMemo } from "react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useSubscribe } from "@nostr-dev-kit/react";
import { NDKWFAdminFeature, type AdminFeatureType } from "../NDKWFAdminFeature";
import { ADMIN_PUBKEYS } from "../../config/admins";
import { getAppDataSubscriptionOptions } from "../../config/nostr";

/**
 * Subscribe to admin feature events of a given type.
 * Only events authored by ADMIN_PUBKEYS are returned.
 */
export function useAdminFeatures(type: AdminFeatureType) {
  const filters: NDKFilter[] = useMemo(
    () => [
      {
        kinds: [30078],
        authors: ADMIN_PUBKEYS,
        "#l": [NDKWFAdminFeature.labelFor(type)],
      },
    ],
    [type]
  );

  const { events, eose } = useSubscribe(filters, getAppDataSubscriptionOptions());

  const features = useMemo(
    () => events.map((e) => NDKWFAdminFeature.from(e)),
    [events]
  );

  return { features, isLoading: !eose };
}
