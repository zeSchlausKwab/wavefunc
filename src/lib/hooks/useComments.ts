import { type NDKFilter } from "@nostr-dev-kit/ndk";
import {
  NDKEvent,
  NDKKind,
  useNDKCurrentUser,
  useSubscribe,
} from "@nostr-dev-kit/react";
import { useMemo } from "react";

export interface CommentNode {
  event: NDKEvent;
  children: CommentNode[];
  depth: number;
}

/**
 * Hook to fetch and organize comments into a threaded structure
 *
 * Supports NIP-22 threaded comments on addressable events:
 * - Root comments use uppercase A/K/P tags to reference the station
 * - Replies use lowercase e/p tags to reference parent comments
 * - Builds a tree structure with proper nesting
 */
export function useComments(rootEvent: NDKEvent) {
  const currentUser = useNDKCurrentUser();

  const filters: NDKFilter[] = useMemo(() => {
    const dTag = rootEvent.tagValue("d");
    const address = `${rootEvent.kind}:${rootEvent.pubkey}:${dTag}`;

    return [
      {
        kinds: [NDKKind.GenericReply], // kind 1111 (NIP-22 comments)
        "#A": [address], // Uppercase A tag for root addressable event
      },
      {
        kinds: [NDKKind.GenericReply],
        "#a": [address], // Lowercase a tag for compatibility
      },
    ];
  }, [rootEvent.kind, rootEvent.pubkey, rootEvent.tagValue("d")]);

  const { events } = useSubscribe<NDKEvent>(
    filters,
    { closeOnEose: false, groupable: false },
    [rootEvent.id, rootEvent.pubkey, rootEvent.tagValue("d")]
  );

  const commentTree = useMemo(() => {
    return buildCommentTree(events, rootEvent.id);
  }, [events, rootEvent.id]);

  const userHasCommented = useMemo(() => {
    return events.some((e) => e.pubkey === currentUser?.pubkey);
  }, [events, currentUser?.pubkey]);

  return {
    comments: commentTree,
    allComments: events,
    totalCount: events.length,
    userHasCommented,
    isLoading: false,
  };
}

/**
 * Build a hierarchical comment tree from flat list of events
 *
 * Algorithm:
 * 1. Separate root comments (reference station) from replies (reference other comments)
 * 2. Build a map of parent ID -> children
 * 3. Recursively build tree structure with depth tracking
 */
function buildCommentTree(events: NDKEvent[], rootEventId: string): CommentNode[] {
  // Create a map of event ID -> event for quick lookup
  const eventMap = new Map<string, NDKEvent>();
  events.forEach((event) => {
    eventMap.set(event.id, event);
  });

  // Separate root comments from replies
  const rootComments: NDKEvent[] = [];
  const replyMap = new Map<string, NDKEvent[]>(); // parent ID -> replies

  events.forEach((event) => {
    // Check if this is a root comment or a reply
    const replyToTag = event.tags.find(
      (tag) => tag[0] === "e" && tag[3] === "reply"
    );

    const mentionTag = event.tags.find(
      (tag) => tag[0] === "e" && tag[3] !== "root"
    );

    if (replyToTag) {
      // This is a reply to another comment
      const parentId = replyToTag[1];
      if (!replyMap.has(parentId)) {
        replyMap.set(parentId, []);
      }
      replyMap.get(parentId)!.push(event);
    } else if (mentionTag && mentionTag[1] !== rootEventId) {
      // Reply to another comment (without explicit "reply" marker)
      const parentId = mentionTag[1];
      if (!replyMap.has(parentId)) {
        replyMap.set(parentId, []);
      }
      replyMap.get(parentId)!.push(event);
    } else {
      // This is a root-level comment on the station
      rootComments.push(event);
    }
  });

  // Build tree recursively
  function buildNode(event: NDKEvent, depth: number): CommentNode {
    const children = replyMap.get(event.id) || [];
    return {
      event,
      depth,
      children: children
        .sort((a, b) => (a.created_at || 0) - (b.created_at || 0)) // Sort by time ascending
        .map((child) => buildNode(child, depth + 1)),
    };
  }

  // Build and return root nodes, sorted by time (newest first for root level)
  return rootComments
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    .map((event) => buildNode(event, 0));
}