import type { NDKKind, NostrEvent } from "@nostr-dev-kit/ndk";
import {
  RadioEventContentSchema,
  FavoritesEventContentSchema,
} from "../schemas/radio";
import type { z } from "zod";
import NDK, { NDKSubscriptionCacheUsage } from "@nostr-dev-kit/ndk";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { Station } from "../types/station";

export const RADIO_EVENT_KINDS = {
  STREAM: 31337,
  FAVORITES: 30078,
  SONG_HISTORY: 31339,
  SONG_LIBRARY: 31340,
} as const;

type RadioEventContent = z.infer<typeof RadioEventContentSchema>;
type FavoritesEventContent = z.infer<typeof FavoritesEventContentSchema>;

/**
 * Creates an unsigned radio station event
 */
export function createRadioEvent(
  content: {
    name: string;
    description: string;
    website: string;
    streams: {
      url: string;
      format: string;
      quality: {
        bitrate: number;
        codec: string;
        sampleRate: number;
      };
      primary?: boolean;
    }[];
  },
  tags: string[][]
): NostrEvent {
  return {
    kind: RADIO_EVENT_KINDS.STREAM,
    created_at: Math.floor(Date.now() / 1000),
    tags: [...tags, ["client", "nostr_radio"]],
    content: JSON.stringify(content),
    pubkey: "",
  };
}

/**
 * Creates an unsigned favorites list event
 */
export function createFavoritesEvent(
  content: FavoritesEventContent,
  isPrivate: boolean = false
): NostrEvent {
  return {
    kind: RADIO_EVENT_KINDS.FAVORITES,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      [
        "d",
        `radio_favorites:${content.name.toLowerCase().replace(/\s+/g, "_")}`,
      ],
      ...content.favorites.map((fav) => ["e", fav.event_id]),
      ["client", "nostr_radio"],
    ],
    content: JSON.stringify(content),
    pubkey: "",
  };
}

/**
 * Validates and parses a radio station event
 */
export function parseRadioEvent(event: NDKEvent | NostrEvent) {
  console.log("event", event);
  if (event.kind !== RADIO_EVENT_KINDS.STREAM) {
    throw new Error("Invalid event kind");
  }

  const content = JSON.parse(event.content);
  return {
    name: content.name,
    description: content.description,
    website: content.website,
    streams: content.streams,
    tags: event.tags as string[][],
  };
}

/**
 * Subscribe to radio station events
 * @param ndk NDK instance
 * @param onEvent Callback for each event
 * @returns NDKSubscription
 */
export function subscribeToRadioStations(
  ndk: NDK,
  onEvent?: (event: NDKEvent) => void
) {
  const filter = {
    kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
    // since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7,
  };

  const subscription = ndk.subscribe(filter, {
    closeOnEose: false,
    cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
  });

  if (onEvent) {
    subscription.on("event", (event: NDKEvent) => {
      try {
        const parsed = parseRadioEvent(event);
        onEvent(event);
      } catch (e) {
        console.warn("Invalid radio event:", e);
      }
    });
  }

  return subscription;
}

/**
 * Fetch all radio stations
 * @param ndk NDK instance
 * @returns Promise<NDKEvent[]>
 */
export async function fetchRadioStations(ndk: NDK): Promise<NDKEvent[]> {
  const filter = {
    kinds: [RADIO_EVENT_KINDS.STREAM],
    since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7, // Last 7 days
  };

  const events = await ndk.fetchEvents(filter);
  return Array.from(events).filter((event) => {
    try {
      parseRadioEvent(event);
      return true;
    } catch {
      return false;
    }
  });
}

export function stationToNostrEvent(station: Station): NostrEvent {
  return {
    kind: RADIO_EVENT_KINDS.STREAM,
    content: JSON.stringify({
      name: station.name,
      description: station.description,
      website: station.website,
      streams: station.streams,
    }),
    created_at: station.created_at,
    pubkey: station.pubkey,
    tags: station.tags,
  };
}
