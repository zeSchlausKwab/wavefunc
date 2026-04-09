import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { z } from "zod";
import {
  getAddressableReferences,
  getFirstTagValue,
  getMatchingTags,
  parseJsonContent,
  removeTags,
} from "./shared";

export const WF_FAVORITES_KIND = 30078;
export const FAVORITES_LIST_LABEL = "wavefunc_user_favourite_list";

const FavoritesContentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  image: z.url().optional(),
  banner: z.url().optional(),
});

export type FavoritesContent = z.infer<typeof FavoritesContentSchema>;
export type ParsedFavoritesList = ReturnType<typeof parseFavoritesListEvent>;

export type FavoritesTemplateInput = {
  favoritesId?: string;
  name?: string;
  description?: string;
  image?: string;
  banner?: string;
  stationAddresses?: string[];
};

function assertStationAddress(stationAddress: string) {
  if (!stationAddress.startsWith(`${31237}:`)) {
    throw new Error("Invalid station address, must start with '31237:'");
  }
}

function buildFavoritesContent(input: FavoritesTemplateInput): FavoritesContent {
  return {
    name: input.name ?? "My Favorite Stations",
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(input.banner ? { banner: input.banner } : {}),
  };
}

export function isFavoritesListEvent(event: NostrEvent): boolean {
  return event.kind === WF_FAVORITES_KIND && getFirstTagValue(event, "l") === FAVORITES_LIST_LABEL;
}

export function getFavoriteStationAddresses(event: NostrEvent) {
  return getMatchingTags(event, "a")
    .map((tag) => tag[1])
    .filter(
      (address): address is string =>
        Boolean(address) && address.startsWith("31237:")
    );
}

export function parseFavoritesListEvent(event: NostrEvent, relays?: string[]) {
  const content = parseJsonContent<FavoritesContent>(event.content);
  const refs = getAddressableReferences(event, relays);

  return {
    event,
    id: event.id,
    kind: WF_FAVORITES_KIND,
    pubkey: event.pubkey,
    created_at: event.created_at,
    content: event.content,
    tags: event.tags,
    favoritesId: getFirstTagValue(event, "d"),
    name: getFirstTagValue(event, "name") ?? content?.name,
    description:
      getFirstTagValue(event, "description") ?? content?.description,
    image: content?.image,
    banner: content?.banner,
    stationAddresses: getFavoriteStationAddresses(event),
    relays,
    ...refs,
  };
}

export function getFavoritesListAddress(
  list: Pick<ParsedFavoritesList, "address" | "pubkey" | "favoritesId">
) {
  return list.address ?? `30078:${list.pubkey}:${list.favoritesId ?? ""}`;
}

export function getFavoritesListStationCount(
  list: Pick<ParsedFavoritesList, "stationAddresses">
) {
  return list.stationAddresses.length;
}

export function hasFavoriteStation(
  list: Pick<ParsedFavoritesList, "stationAddresses">,
  stationAddress: string
) {
  return list.stationAddresses.includes(stationAddress);
}

export function buildFavoritesListTemplate(
  input: FavoritesTemplateInput = {}
): EventTemplate {
  const favoritesId = input.favoritesId ?? crypto.randomUUID();
  const stationAddresses = input.stationAddresses ?? [];

  for (const stationAddress of stationAddresses) {
    assertStationAddress(stationAddress);
  }

  const content = buildFavoritesContent(input);
  const tags: string[][] = [
    ["d", favoritesId],
    ["l", FAVORITES_LIST_LABEL],
    ["name", content.name],
    ...stationAddresses.map((address) => ["a", address]),
  ];

  if (content.description) {
    tags.push(["description", content.description]);
  }

  return {
    kind: WF_FAVORITES_KIND,
    content: JSON.stringify(content),
    tags,
  };
}

export function buildFavoritesListUpdateTemplate(
  event: NostrEvent,
  input: Partial<Omit<FavoritesTemplateInput, "favoritesId">> = {}
): EventTemplate {
  const current = parseFavoritesListEvent(event);

  return buildFavoritesListTemplate({
    favoritesId: current.favoritesId,
    name: input.name ?? current.name ?? "My Favorite Stations",
    description: input.description ?? current.description,
    image: input.image ?? current.image,
    banner: input.banner ?? current.banner,
    stationAddresses: input.stationAddresses ?? current.stationAddresses,
  });
}

export function buildFavoritesListAddStationTemplate(
  event: NostrEvent,
  stationAddress: string,
  relay?: string
): EventTemplate {
  assertStationAddress(stationAddress);

  if (getFavoriteStationAddresses(event).includes(stationAddress)) {
    return {
      kind: event.kind,
      content: event.content,
      tags: event.tags.map((tag) => [...tag]),
    };
  }

  return {
    kind: event.kind,
    content: event.content,
    tags: [...event.tags.map((tag) => [...tag]), ["a", stationAddress, ...(relay ? [relay] : [])]],
  };
}

export function buildFavoritesListRemoveStationTemplate(
  event: NostrEvent,
  stationAddress: string
): EventTemplate {
  assertStationAddress(stationAddress);

  return {
    kind: event.kind,
    content: event.content,
    tags: removeTags(event.tags, "a", (tag) => tag[1] === stationAddress),
  };
}

export function buildFavoritesListDeletionTemplate(
  event: NostrEvent,
  reason = "Deleted favorites list"
): EventTemplate {
  const favoritesId = getFirstTagValue(event, "d");
  const tags: string[][] = [
    ["e", event.id],
    ["k", String(WF_FAVORITES_KIND)],
    ["p", event.pubkey],
  ];

  if (favoritesId) {
    tags.push(["a", `${WF_FAVORITES_KIND}:${event.pubkey}:${favoritesId}`]);
  }

  return {
    kind: 5,
    content: reason,
    tags,
  };
}
