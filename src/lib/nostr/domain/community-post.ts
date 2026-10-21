// Community feed uses NIP-10 kind 1 notes. Historical kind 1111 replies remain readable.

import { getNip10References } from "applesauce-common/helpers/threading";
import { ensureMarkedEventPointerTag } from "applesauce-core/helpers/factory";
import { getOrComputeCachedValue } from "applesauce-core/helpers/cache";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { EventTemplate } from "../types";
import { getMatchingTags } from "./shared";

export const COMMUNITY_TOPIC = "wavefunc";
export const COMMUNITY_POST_KIND = 1;
export const COMMUNITY_REPLY_KIND = 1;
export const LEGACY_COMMUNITY_REPLY_KIND = 1111;

export type CommunityCategory = "bug" | "feature" | "greeting" | "general";

const ParsedCommunityPostSymbol = Symbol("ParsedCommunityPost");

export type ParsedCommunityPost = ReturnType<typeof parseCommunityPostEvent>;

/** Parse a kind 1 root note or kind 1111 reply tagged #wavefunc. */
export function parseCommunityPostEvent(event: NostrEvent) {
  return getOrComputeCachedValue(event, ParsedCommunityPostSymbol, () => {
    const topicTags = getMatchingTags(event, "t")
      .map((tag) => tag[1])
      .filter((value): value is string => Boolean(value));
    const categories = topicTags.filter(
      (tag) => tag !== COMMUNITY_TOPIC,
    ) as CommunityCategory[];

    const refs = getNip10References(event);
    const replyTag = event.tags.find(
      (tag) => tag[0] === "e" && tag[3] === "reply",
    );
    const fallbackEtag = event.tags.find((tag) => tag[0] === "e");
    const parentEventId = refs.reply?.e?.id ?? refs.root?.e?.id ?? replyTag?.[1] ?? fallbackEtag?.[1];

    return {
      event,
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      created_at: event.created_at,
      content: event.content,
      tags: event.tags,
      categories,
      isReply: Boolean(parentEventId) || event.kind === LEGACY_COMMUNITY_REPLY_KIND,
      parentEventId,
    };
  });
}

export type CommunityRootInput = {
  content: string;
  category?: CommunityCategory;
};

export function buildCommunityRootTemplate(
  input: CommunityRootInput,
): EventTemplate {
  const tags: string[][] = [["t", COMMUNITY_TOPIC]];
  if (input.category && input.category !== "general") {
    tags.push(["t", input.category]);
  }
  return {
    kind: COMMUNITY_POST_KIND,
    content: input.content,
    tags,
  };
}

export function buildCommunityReplyTemplate(
  parent: Pick<NostrEvent, "id" | "pubkey" | "kind" | "tags">,
  content: string,
  originalRoot?: Pick<NostrEvent, "id" | "pubkey">,
): EventTemplate {
  const refs = getNip10References(parent);
  const root = originalRoot ? { id: originalRoot.id, author: originalRoot.pubkey }
    : refs.root?.e ?? { id: parent.id, author: parent.pubkey };
  let tags = ensureMarkedEventPointerTag([["t", COMMUNITY_TOPIC]], root, "root");
  tags = ensureMarkedEventPointerTag(tags, { id: parent.id, author: parent.pubkey }, "reply");
  tags.push(["p", parent.pubkey]);
  return { kind: COMMUNITY_REPLY_KIND, content, tags };
}
