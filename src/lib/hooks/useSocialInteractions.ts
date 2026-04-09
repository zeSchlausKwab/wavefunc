import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useMemo } from "react";
import { map, of, scan, startWith } from "rxjs";
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

/**
 * Hook to fetch and track social interactions (reactions, zaps, comments) for an event
 *
 * This hook subscribes to:
 * - Reactions (kind 7) with content "❤️" or "+"
 * - Zap receipts (kind 9735)
 * - Generic replies (kind 1111) per NIP-22
 */
type SocialTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">;

export function useSocialInteractions(event: SocialTarget): SocialInteractionState {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool } = useWavefuncNostr();
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);

  const filters: Filter[] = useMemo(() => {
    const dTag = getFirstTagValue(event, "d");
    const address = dTag ? `${event.kind}:${event.pubkey}:${dTag}` : null;
    const result: Filter[] = [
      {
        kinds: [7],
        "#e": [event.id],
      },
      {
        kinds: [9735],
        "#e": [event.id],
      },
      {
        kinds: [1111],
        "#e": [event.id],
      },
    ];

    if (address) {
      result.push({ kinds: [7], "#a": [address] });
      result.push({ kinds: [9735], "#a": [address] });
      result.push({ kinds: [1111], "#a": [address] });
    }

    return result;
  }, [event.id, event.kind, event.pubkey, JSON.stringify(event.tags)]);

  const filtersKey = JSON.stringify(filters);

  const eose =
    use$(
      () => {
        if (filters.length === 0) {
          return of(true);
        }

        return relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        );
      },
      [eventStore, filtersKey, relayPool, relaysKey]
    ) ?? false;

  const events =
    use$(
      () => {
        if (filters.length === 0) {
          return of([]);
        }

        return eventStore.timeline(filters).pipe(map((timeline) => [...timeline]));
      },
      [eventStore, filtersKey]
    ) ?? [];

  const state = useMemo(() => {
    const reactions = new Set<string>();
    const zaps = new Set<string>();
    const comments = new Set<string>();
    let userHasReacted = false;
    let userHasZapped = false;
    let userHasCommented = false;

    events.forEach((e) => {
      if (e.kind === 7) {
        reactions.add(e.id);
        if (e.pubkey === currentUser?.pubkey) {
          userHasReacted = true;
        }
      }

      if (e.kind === 9735) {
        zaps.add(e.id);
        const zapperPubkey =
          e.tags.find((tag) => tag[0] === "P")?.[1] ??
          e.tags.find((tag) => tag[0] === "p")?.[1];
        if (zapperPubkey === currentUser?.pubkey) {
          userHasZapped = true;
        }
      }

      if (e.kind === 1111) {
        comments.add(e.id);
        if (e.pubkey === currentUser?.pubkey) {
          userHasCommented = true;
        }
      }
    });

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

  return state;
}
