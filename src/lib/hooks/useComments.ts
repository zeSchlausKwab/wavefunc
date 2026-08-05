// Builds a threaded NIP-22 comment tree on the shared cached query layer.

import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { useMemo } from "react";
import { useCurrentAccount } from "../nostr/auth";
import { getFirstTagValue } from "../nostr/domain";
import { useAppDataTimeline } from "../nostr/hooks/useRelayTimeline";

export interface CommentNode {
  event: NostrEvent;
  children: CommentNode[];
  depth: number;
}

type CommentTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">;

export function useComments(rootEvent: CommentTarget) {
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

  const { events, isLoading } = useAppDataTimeline(
    filters.length > 0 ? filters : null,
  );

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
  };
}

function buildCommentTree(events: NostrEvent[], rootEventId: string): CommentNode[] {
  const rootComments: NostrEvent[] = [];
  const replyMap = new Map<string, NostrEvent[]>();

  for (const event of events) {
    const replyToTag = event.tags.find(
      (tag) => tag[0] === "e" && tag[3] === "reply",
    );
    const mentionTag = event.tags.find(
      (tag) => tag[0] === "e" && tag[3] !== "root",
    );

    if (replyToTag) {
      const parentId = replyToTag[1]!;
      if (!replyMap.has(parentId)) replyMap.set(parentId, []);
      replyMap.get(parentId)!.push(event);
    } else if (mentionTag && mentionTag[1] !== rootEventId) {
      const parentId = mentionTag[1]!;
      if (!replyMap.has(parentId)) replyMap.set(parentId, []);
      replyMap.get(parentId)!.push(event);
    } else {
      rootComments.push(event);
    }
  }

  function buildNode(event: NostrEvent, depth: number): CommentNode {
    const children = replyMap.get(event.id) ?? [];
    return {
      event,
      depth,
      children: children
        .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
        .map((child) => buildNode(child, depth + 1)),
    };
  }

  return rootComments
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
    .map((event) => buildNode(event, 0));
}
