// Canonical applesauce-react reactivity: useEventModel + TimelineModel.
// Counts reactions / zaps / replies for a target event by subscribing to the
// shared TimelineModel on the EventStore. A separate effect keeps a relay
// subscription open so the store stays populated with the matching events.

import { TimelineModel } from "applesauce-core/models";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { merge } from "rxjs";
import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "../nostr/auth";
import { getFirstTagValue } from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";
import {
  loadCommentsByAddress,
  loadLightningZaps,
  loadNutzapsByAddress,
  loadReactions,
  loadSocialByEvent,
} from "../nostr/store";
import { summarizeSocialInteractions } from "../nostr/social";

export interface SocialInteractionCounts {
  reactions: number;
  zaps: number;
  comments: number;
}

export interface SocialInteractionState extends SocialInteractionCounts {
  userHasReacted: boolean;
  userHasZapped: boolean;
  userHasCommented: boolean;
  isLoading: boolean;
}

type SocialTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">;

export function useSocialInteractions(event: SocialTarget): SocialInteractionState {
  const currentUser = useCurrentAccount();
  const { eventStore, readRelays } = useWavefuncNostr();

  const filters: Filter[] = useMemo(() => {
    const dTag = getFirstTagValue(event, "d");
    const address = dTag ? `${event.kind}:${event.pubkey}:${dTag}` : null;
    const result: Filter[] = [
      { kinds: [7], "#e": [event.id] },
      { kinds: [9735], "#e": [event.id] },
      { kinds: [9321], "#e": [event.id] },
      { kinds: [1111], "#e": [event.id] },
    ];

    if (address) {
      result.push({ kinds: [7], "#a": [address] });
      result.push({ kinds: [9735], "#a": [address] });
      result.push({ kinds: [9321], "#a": [address] });
      // NIP-22 top-level comments use an uppercase A root tag.
      result.push({ kinds: [1111], "#A": [address] });
    }

    return result;
  }, [event.id, event.kind, event.pubkey, event.tags]);

  // Active relay subscription so reactions/zaps/comments load into the store.
  const [eose, setEose] = useState(false);
  useEffect(() => {
    setEose(false);
    const dTag = getFirstTagValue(event, "d");
    const address = dTag ? `${event.kind}:${event.pubkey}:${dTag}` : null;
    const streams = [
      loadReactions(event as NostrEvent, readRelays),
      loadLightningZaps(event as NostrEvent, readRelays),
      loadSocialByEvent({ value: event.id, relays: readRelays }),
    ];

    if (address) {
      streams.push(loadNutzapsByAddress({ value: address, relays: readRelays }));
      streams.push(loadCommentsByAddress({ value: address, relays: readRelays }));
    }

    const subscription = merge(...streams)
      .pipe(storeEvents(eventStore))
      .subscribe({
        complete: () => setEose(true),
        error: (error) => {
          console.warn("Failed to load station interactions:", error);
          setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [event, eventStore, readRelays]);

  // Reactive timeline read from the shared model.
  const events =
    useEventModel(TimelineModel, filters.length > 0 ? [filters] : null) ?? [];

  return useMemo(() => {
    return {
      ...summarizeSocialInteractions(events, currentUser?.pubkey),
      isLoading: !eose,
    };
  }, [eose, events, currentUser?.pubkey]);
}
