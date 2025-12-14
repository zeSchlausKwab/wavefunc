import { type NDKFilter } from "@nostr-dev-kit/ndk";
import {
  NDKEvent,
  NDKKind,
  useNDKCurrentUser,
  useSubscribe,
} from "@nostr-dev-kit/react";
import { useMemo } from "react";

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
export function useSocialInteractions(event: NDKEvent): SocialInteractionState {
  const currentUser = useNDKCurrentUser();

  const filters: NDKFilter[] = useMemo(() => {
    const dTag = event.tagValue("d");
    const address = `${event.kind}:${event.pubkey}:${dTag}`;
    return [
      {
        kinds: [NDKKind.Reaction],
        "#a": [address],
      },
      {
        kinds: [NDKKind.Zap],
        "#a": [address],
      },
      {
        kinds: [NDKKind.GenericReply],
        "#a": [address],
      },
    ];
  }, [event.id, event.kind, event.pubkey]);

  const { events } = useSubscribe<NDKEvent>(
    filters,
    { closeOnEose: false, groupable: false },
    [event.id, event.pubkey, event.tagValue("d")]
  );

  const state = useMemo(() => {
    const reactions = new Set<string>();
    const zaps = new Set<string>();
    const comments = new Set<string>();
    let userHasReacted = false;
    let userHasZapped = false;
    let userHasCommented = false;

    events.forEach((e: NDKEvent) => {
      if (e.kind === NDKKind.Reaction) {
        reactions.add(e.id);
        if (e.pubkey === currentUser?.pubkey) {
          userHasReacted = true;
        }
      }

      // Handle zaps
      if (e.kind === NDKKind.Zap) {
        zaps.add(e.id);
        const zapperPubkey = e.tagValue("P");
        if (zapperPubkey === currentUser?.pubkey) {
          userHasZapped = true;
        }
      }

      if (e.kind === NDKKind.GenericReply) {
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
      isLoading: false,
    };
  }, [events, currentUser?.pubkey]);

  return state;
}
