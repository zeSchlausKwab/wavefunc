import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import {
  getAddressableReferences,
  getFirstTagValue,
  getMatchingTags,
  removeTags,
} from "./shared";

export const WF_SONG_LIST_KIND = 30078;
export const SONG_LIST_LABEL = "wavefunc_user_song_list";

export type SongListTemplateInput = {
  listId?: string;
  name?: string;
  description?: string;
  songAddresses?: string[];
};

function assertSongAddress(songAddress: string) {
  if (!songAddress.startsWith(`${31337}:`)) {
    throw new Error("Invalid song address, must start with '31337:'");
  }
}

export function isSongListEvent(event: NostrEvent): boolean {
  return event.kind === WF_SONG_LIST_KIND && getFirstTagValue(event, "l") === SONG_LIST_LABEL;
}

export function getSongAddresses(event: NostrEvent) {
  return getMatchingTags(event, "a")
    .map((tag) => tag[1])
    .filter(
      (address): address is string => Boolean(address) && address.startsWith("31337:")
    );
}

export function parseSongListEvent(event: NostrEvent, relays?: string[]) {
  const refs = getAddressableReferences(event, relays);

  return {
    event,
    kind: WF_SONG_LIST_KIND,
    listId: getFirstTagValue(event, "d"),
    name: getFirstTagValue(event, "name"),
    description: getFirstTagValue(event, "description"),
    label: getFirstTagValue(event, "l"),
    songAddresses: getSongAddresses(event),
    ...refs,
  };
}

export function buildSongListTemplate(
  input: SongListTemplateInput = {}
): EventTemplate {
  const listId = input.listId ?? crypto.randomUUID();
  const songAddresses = input.songAddresses ?? [];

  for (const songAddress of songAddresses) {
    assertSongAddress(songAddress);
  }

  const tags: string[][] = [
    ["d", listId],
    ["l", SONG_LIST_LABEL],
    ["name", input.name ?? "Liked Songs"],
    ...songAddresses.map((address) => ["a", address]),
  ];

  if (input.description) {
    tags.push(["description", input.description]);
  }

  return {
    kind: WF_SONG_LIST_KIND,
    content: "",
    tags,
  };
}

export function buildSongListAddSongTemplate(
  event: NostrEvent,
  songAddress: string,
  relay?: string
): EventTemplate {
  assertSongAddress(songAddress);

  if (getSongAddresses(event).includes(songAddress)) {
    return {
      kind: event.kind,
      content: event.content,
      tags: event.tags.map((tag) => [...tag]),
    };
  }

  return {
    kind: event.kind,
    content: event.content,
    tags: [...event.tags.map((tag) => [...tag]), ["a", songAddress, ...(relay ? [relay] : [])]],
  };
}

export function buildSongListRemoveSongTemplate(
  event: NostrEvent,
  songAddress: string
): EventTemplate {
  assertSongAddress(songAddress);

  return {
    kind: event.kind,
    content: event.content,
    tags: removeTags(event.tags, "a", (tag) => tag[1] === songAddress),
  };
}

