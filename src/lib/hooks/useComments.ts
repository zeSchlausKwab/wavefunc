// Builds a threaded NIP-22 comment tree on the shared cached query layer.

import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$, } from "applesauce-react/hooks";
import { relayPreferences } from "../../config/relayPreferences";
import { getSocialRelayUrls } from "../../config/nostr";
import { buildCommentTree } from "../nostr/domain/comment-tree";
export type { CommentNode } from "../nostr/domain/comment-tree";
import { useMemo } from "react";
import { useCurrentAccount } from "../nostr/auth";
import { getFirstTagValue } from "../nostr/domain";
import { useRelayTimeline } from "../nostr/hooks/useRelayTimeline";

type CommentTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">;

export function useComments(rootEvent: CommentTarget) {
  use$(relayPreferences.state$);
  const currentUser = useCurrentAccount();

  const dTag = getFirstTagValue(rootEvent, "d");
  const address = dTag ? `${rootEvent.kind}:${rootEvent.pubkey}:${dTag}` : null;

  const filters: Filter[] = useMemo(() => {
    if (!address) return [];
    return [
      { kinds: [1111], "#A": [address] },
      { kinds: [1111], "#a": [address] },
    ];
  }, [address]);

  const { events, isLoading, error } = useRelayTimeline({ filters: filters.length > 0 ? filters : null, relays: getSocialRelayUrls() });

  const commentTree = useMemo(
    () => buildCommentTree(events, rootEvent.id),
    [events, rootEvent.id],
  );

  const userHasCommented = useMemo(
    () => events.some((e) => e.pubkey === currentUser?.pubkey),
    [events, currentUser?.pubkey],
  );

  return {
    comments: commentTree,
    allComments: events,
    totalCount: events.length,
    userHasCommented,
    isLoading,
    error,
  };
}
