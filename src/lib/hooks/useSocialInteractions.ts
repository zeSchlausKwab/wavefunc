// Canonical applesauce-react reactivity: useEventModel + TimelineModel.
// Counts reactions / zaps / replies for a target event by subscribing to the
// shared TimelineModel on the EventStore. A separate effect keeps a relay
// subscription open so the store stays populated with the matching events.

import { TimelineModel } from "applesauce-core/models";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$, useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { merge } from "rxjs";
import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount } from "../nostr/auth";
import { getFirstTagValue } from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";
import {
  loadLightningZaps,
  loadNutzapsByAddress,
  loadReactions,
  loadSocialByEvent,
} from "../nostr/store";
import { summarizeSocialInteractions } from "../nostr/social";
import { selectCommentCount } from "../nostr/commentCount";
import { useCommentCount } from "../nostr/hooks/useCommentCount";
import { relayPreferences } from "../../config/relayPreferences";
import { getSocialRelayUrls, getZapRelayUrls } from "../../config/nostr";

export interface SocialInteractionCounts {
  reactions: number;
  zaps: number;
  comments: number | undefined;
}

export interface SocialInteractionState extends SocialInteractionCounts {
  userHasReacted: boolean;
  userHasZapped: boolean;
  userHasCommented: boolean;
  isLoading: boolean;
  error: unknown;
  commentCountRelay?: string;
  commentCountApproximate?: boolean;
  commentCountFresh?: boolean;
  commentCountLowerBound?: boolean;
}

type SocialTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags" | "created_at">;

export function useSocialInteractions(event: SocialTarget, enabled = true): SocialInteractionState {
  const currentUser = useCurrentAccount();
  const { eventStore } = useWavefuncNostr();
  const preferences = use$(relayPreferences.state$);
  const socialRelays = useMemo(() => getSocialRelayUrls(), [preferences]);
  const zapRelays = useMemo(() => getZapRelayUrls(), [preferences]);
  const commentCount = useCommentCount(event, currentUser?.pubkey, enabled);

  const filters: Filter[] = useMemo(() => {
    const dTag = getFirstTagValue(event, "d");
    const address = dTag ? `${event.kind}:${event.pubkey}:${dTag}` : null;
    const result: Filter[] = [
      { kinds: [7], "#e": [event.id] },
      { kinds: [9735], "#e": [event.id] },
      { kinds: [9321], "#e": [event.id] },
      { kinds: [1111], "#e": [event.id] },
      { kinds: [1111], "#E": [event.id] },
    ];

    if (address) {
      result.push({ kinds: [7], "#a": [address] });
      result.push({ kinds: [9735], "#a": [address] });
      result.push({ kinds: [9321], "#a": [address] });
      // NIP-22 top-level comments use an uppercase A root tag.
      result.push({ kinds: [1111], "#A": [address] });
      result.push({ kinds: [1111], "#a": [address] });
    }

    return result;
  }, [event.id, event.kind, event.pubkey, event.tags]);

  // Active relay subscription so reactions/zaps/comments load into the store.
  const [error, setError] = useState<unknown>();
  const [eose, setEose] = useState(false);
  useEffect(() => {
    setEose(false);
    setError(undefined);
    if (!enabled) return;
    const dTag = getFirstTagValue(event, "d");
    const address = dTag ? `${event.kind}:${event.pubkey}:${dTag}` : null;
    const streams = [
      loadReactions(event as NostrEvent, socialRelays),
      loadLightningZaps(event as NostrEvent, zapRelays),
      loadSocialByEvent({ value: event.id, relays: socialRelays }),
    ];

    if (address) {
      streams.push(loadNutzapsByAddress({ value: address, relays: socialRelays }));
    }

    const subscription = merge(...streams)
      .pipe(storeEvents(eventStore))
      .subscribe({
        complete: () => setEose(true),
        error: (error) => {
          setError(error);
          setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [enabled, event.id, event.kind, event.pubkey, JSON.stringify(event.tags), eventStore, socialRelays, zapRelays]);

  // Reactive timeline read from the shared model.
  const events =
    useEventModel(TimelineModel<NostrEvent>, filters.length > 0 ? [filters] : null) ?? [];

  return useMemo(() => {
    const summary = summarizeSocialInteractions(events, currentUser?.pubkey);
    const count = selectCommentCount(commentCount, summary.comments);
    return {
      ...summary,
      comments: count.value,
      commentCountRelay: count.origin,
      commentCountApproximate: count.approximate,
      commentCountFresh: count.fresh,
      commentCountLowerBound: count.lowerBound,
      error: error ?? count.error,
      isLoading: !eose,
    };
  }, [eose, events, currentUser?.pubkey, error, commentCount]);
}
