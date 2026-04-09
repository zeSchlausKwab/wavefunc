import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { getFirstTagValue } from "./shared";

export function buildReactionTemplate(
  event: Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">,
  content = "❤️"
): EventTemplate {
  const identifier = getFirstTagValue(event, "d");
  const tags: string[][] = [
    ["e", event.id],
    ["p", event.pubkey],
    ["k", String(event.kind)],
  ];

  if (identifier) {
    tags.push(["a", `${event.kind}:${event.pubkey}:${identifier}`]);
  }

  return {
    kind: 7,
    content,
    tags,
  };
}
