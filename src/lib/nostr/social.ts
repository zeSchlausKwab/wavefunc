import type { NostrEvent } from "applesauce-core/helpers/event";

export type SocialInteractionSummary = {
  reactions: number;
  zaps: number;
  comments: number;
  userHasReacted: boolean;
  userHasZapped: boolean;
  userHasCommented: boolean;
};

export function summarizeSocialInteractions(
  events: NostrEvent[],
  currentPubkey?: string,
): SocialInteractionSummary {
  const reactions = new Set<string>();
  const zaps = new Set<string>();
  const comments = new Set<string>();
  let userHasReacted = false;
  let userHasZapped = false;
  let userHasCommented = false;

  for (const event of events) {
    if (event.kind === 7) {
      reactions.add(event.pubkey);
      if (event.pubkey === currentPubkey) userHasReacted = true;
    } else if (event.kind === 9735 || event.kind === 9321) {
      zaps.add(event.id);
      let zapperPubkey = event.kind === 9321 ? event.pubkey : undefined;
      if (!zapperPubkey) {
        zapperPubkey = event.tags.find((tag) => tag[0] === "P")?.[1];
      }
      if (!zapperPubkey) {
        const description = event.tags.find(
          (tag) => tag[0] === "description",
        )?.[1];
        try {
          zapperPubkey = description
            ? (JSON.parse(description) as { pubkey?: string }).pubkey
            : undefined;
        } catch {
          // Invalid third-party receipts still count, but cannot be attributed.
        }
      }
      if (zapperPubkey === currentPubkey) userHasZapped = true;
    } else if (event.kind === 1111) {
      comments.add(event.id);
      if (event.pubkey === currentPubkey) userHasCommented = true;
    }
  }

  return {
    reactions: reactions.size,
    zaps: zaps.size,
    comments: comments.size,
    userHasReacted,
    userHasZapped,
    userHasCommented,
  };
}
