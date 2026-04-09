// Canonical applesauce-react reactivity: useEventModel + TimelineModel.
// Counts reactions / zaps / replies for a target event by subscribing to the
// shared TimelineModel on the EventStore. A separate effect keeps a relay
// subscription open so the store stays populated with the matching events.

import { TimelineModel } from "applesauce-core/models";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useEffect, useMemo, useState } from "react";
import { getAppDataRelayUrls } from "../../config/nostr";
import { useCurrentAccount } from "../nostr/auth";
import { getFirstTagValue } from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";

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
  const { eventStore, relayPool } = useWavefuncNostr();

  const filters: Filter[] = useMemo(() => {
    const dTag = getFirstTagValue(event, "d");
    const address = dTag ? `${event.kind}:${event.pubkey}:${dTag}` : null;
    const result: Filter[] = [
      { kinds: [7], "#e": [event.id] },
      { kinds: [9735], "#e": [event.id] },
      { kinds: [1111], "#e": [event.id] },
    ];

    if (address) {
      result.push({ kinds: [7], "#a": [address] });
      result.push({ kinds: [9735], "#a": [address] });
      result.push({ kinds: [1111], "#a": [address] });
    }

    return result;
  }, [event.id, event.kind, event.pubkey, JSON.stringify(event.tags)]);

  // Active relay subscription so reactions/zaps/comments load into the store.
  const [eose, setEose] = useState(false);
  useEffect(() => {
    if (filters.length === 0) {
      setEose(true);
      return;
    }
    setEose(false);
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe({
        next: (message) => {
          if (message === "EOSE") setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  // Reactive timeline read from the shared model.
  const events =
    useEventModel(TimelineModel, filters.length > 0 ? [filters] : null) ?? [];

  return useMemo(() => {
    const reactions = new Set<string>();
    const zaps = new Set<string>();
    const comments = new Set<string>();
    let userHasReacted = false;
    let userHasZapped = false;
    let userHasCommented = false;

    for (const e of events) {
      if (e.kind === 7) {
        reactions.add(e.id);
        if (e.pubkey === currentUser?.pubkey) userHasReacted = true;
      } else if (e.kind === 9735) {
        zaps.add(e.id);
        const zapperPubkey =
          e.tags.find((tag) => tag[0] === "P")?.[1] ??
          e.tags.find((tag) => tag[0] === "p")?.[1];
        if (zapperPubkey === currentUser?.pubkey) userHasZapped = true;
      } else if (e.kind === 1111) {
        comments.add(e.id);
        if (e.pubkey === currentUser?.pubkey) userHasCommented = true;
      }
    }

    return {
      reactions: reactions.size,
      zaps: zaps.size,
      comments: comments.size,
      userHasReacted,
      userHasZapped,
      userHasCommented,
      isLoading: !eose,
    };
  }, [eose, events, currentUser?.pubkey]);
}
