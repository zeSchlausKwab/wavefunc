import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useMemo } from "react";
import { map, of, scan, startWith } from "rxjs";
import { getAppDataRelayUrls } from "../../config/nostr";
import { getFirstTagValue } from "../nostr/domain";
import { useCurrentAccount } from "../nostr/auth";
import { useWavefuncNostr } from "../nostr/runtime";

export interface CommentNode {
  event: NostrEvent;
  children: CommentNode[];
  depth: number;
}

type CommentTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">;

export function useComments(rootEvent: CommentTarget) {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool } = useWavefuncNostr();
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);

  const dTag = getFirstTagValue(rootEvent, "d");
  const address = dTag ? `${rootEvent.kind}:${rootEvent.pubkey}:${dTag}` : null;

  const filters: Filter[] = useMemo(() => {
    if (!address) return [];
    return [
      { kinds: [1111], "#A": [address] },
      { kinds: [1111], "#a": [address] },
    ];
  }, [address]);

  const filtersKey = JSON.stringify(filters);

  const eose =
    use$(
      () => {
        if (filters.length === 0) return of(true);
        return relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        );
      },
      [eventStore, filtersKey, relayPool, relaysKey],
    ) ?? false;

  const events =
    use$(
      () => {
        if (filters.length === 0) return of([]);
        return eventStore.timeline(filters).pipe(map((timeline) => [...timeline]));
      },
      [eventStore, filtersKey],
    ) ?? [];

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
    isLoading: !eose,
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
