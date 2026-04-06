import {
  createReplaceableAddress,
  type EventTemplate,
  getTagValue,
  type NostrEvent,
} from "applesauce-core/helpers/event";
import {
  getAddressPointerForEvent,
  naddrEncode,
} from "applesauce-core/helpers/pointers";

export type ParsedAddressableEvent = {
  address: string | null;
  naddr?: string;
};

export function getMatchingTags(event: Pick<NostrEvent, "tags">, name: string) {
  return event.tags.filter((tag) => tag[0] === name);
}

export function getFirstTagValue(
  event: Pick<NostrEvent, "kind" | "tags" | "content">,
  name: string
) {
  return getTagValue(event, name);
}

export function removeTags(
  tags: string[][],
  name: string,
  predicate?: (tag: string[]) => boolean
) {
  return tags.filter((tag) => {
    if (tag[0] !== name) {
      return true;
    }

    return predicate ? !predicate(tag) : false;
  });
}

export function upsertSingletonTag(tags: string[][], tag: [string, ...string[]]) {
  return [...removeTags(tags, tag[0]), tag];
}

export function getAddressableIdentity(
  event: Pick<NostrEvent, "kind" | "pubkey" | "tags">
) {
  const identifier = event.tags.find((tag) => tag[0] === "d")?.[1];
  return createReplaceableAddress(event.kind, event.pubkey, identifier);
}

export function getAddressableReferences(
  event: NostrEvent,
  relays?: string[]
): ParsedAddressableEvent {
  const address = getAddressableIdentity(event);
  const pointer = getAddressPointerForEvent(event, relays);

  return {
    address,
    naddr: pointer ? naddrEncode(pointer) : undefined,
  };
}

export function cloneTemplateFromEvent(event: NostrEvent): EventTemplate {
  return {
    kind: event.kind,
    content: event.content,
    tags: event.tags.map((tag) => [...tag]),
  };
}

export function parseJsonContent<T>(content: string): T | undefined {
  if (!content) {
    return undefined;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

