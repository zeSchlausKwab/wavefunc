import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { getOrComputeCachedValue } from "applesauce-core/helpers/cache";
import { z } from "zod";
import {
  getAddressableIdentity,
  getAddressableReferences,
  getFirstTagValue,
  getMatchingTags,
  parseJsonContent,
} from "./shared";

const ParsedStationSymbol = Symbol("ParsedStation");

export const STATION_KIND = 31237;

const StreamQualitySchema = z.object({
  bitrate: z.number().nonnegative(),
  codec: z.string().min(1),
  sampleRate: z.number().positive(),
});

const StreamSchema = z.object({
  url: z.url(),
  format: z.string().min(1),
  quality: StreamQualitySchema,
  primary: z.boolean().optional(),
});

const StationContentSchema = z.object({
  description: z.string().min(1),
  streams: z.array(StreamSchema).min(1),
  streamingServerUrl: z.url().optional(),
});

export type StreamQuality = z.infer<typeof StreamQualitySchema>;
export type Stream = z.infer<typeof StreamSchema>;
export type StationContent = z.infer<typeof StationContentSchema>;
export type ParsedStation = ReturnType<typeof parseStationEvent>;

export type StationTemplateInput = {
  stationId?: string;
  name: string;
  description: string;
  thumbnail?: string;
  website?: string;
  location?: string;
  countryCode?: string;
  genres?: string[];
  languages?: string[];
  streams: Stream[];
  streamingServerUrl?: string;
};

export type StationDeletionInput = {
  eventId: string;
  pubkey: string;
  stationId?: string;
  reason?: string;
};

function normalizeUrl(url: string) {
  return url.trim().replace(/^`|`$/g, "");
}

function parseStreamTag(tag: string[]): Stream | null {
  if (!tag[1] || !tag[2] || !tag[3]) {
    return null;
  }

  try {
    const quality = StreamQualitySchema.parse(JSON.parse(tag[3]));

    return {
      url: normalizeUrl(tag[1]),
      format: tag[2],
      quality,
      primary: tag.includes("primary"),
    };
  } catch {
    return null;
  }
}

export function isStationEvent(event: NostrEvent): boolean {
  return event.kind === STATION_KIND;
}

export function parseStationEvent(event: NostrEvent, relays?: string[]) {
  // Cache parsed result on the event itself so the same NostrEvent reference
  // yields a stable wrapper object across renders. This keeps React.memo /
  // useMemo / observable-driven re-renders cheap and prevents needless work
  // in downstream consumers.
  return getOrComputeCachedValue(event, ParsedStationSymbol, () => {
    const content = parseJsonContent<StationContent>(event.content);
    const tagStreams = getMatchingTags(event, "stream")
      .map(parseStreamTag)
      .filter((stream): stream is Stream => stream !== null);
    const streams = tagStreams.length > 0 ? tagStreams : content?.streams ?? [];
    const refs = getAddressableReferences(event, relays);

    return {
      event,
      id: event.id,
      kind: STATION_KIND,
      pubkey: event.pubkey,
      created_at: event.created_at,
      content: event.content,
      tags: event.tags,
      stationId: getFirstTagValue(event, "d"),
      name: getFirstTagValue(event, "name"),
      description: getFirstTagValue(event, "description") ?? content?.description,
      thumbnail: getFirstTagValue(event, "thumbnail"),
      website: getFirstTagValue(event, "website"),
      location: getFirstTagValue(event, "location"),
      countryCode: getFirstTagValue(event, "country"),
      genres: getMatchingTags(event, "c")
        .filter((tag) => tag[2] === "genre")
        .map((tag) => tag[1])
        .filter((genre): genre is string => Boolean(genre)),
      languages: getMatchingTags(event, "l")
        .map((tag) => tag[1])
        .filter((language): language is string => Boolean(language)),
      streams,
      streamingServerUrl: content?.streamingServerUrl,
      ...refs,
    };
  });
}

export function buildStationTemplate(
  input: StationTemplateInput
): EventTemplate {
  const stationId = input.stationId ?? crypto.randomUUID();
  const content: StationContent = {
    description: input.description,
    streams: input.streams,
    ...(input.streamingServerUrl
      ? { streamingServerUrl: input.streamingServerUrl }
      : {}),
  };

  const tags: string[][] = [
    ["d", stationId],
    ["name", input.name],
    ["description", input.description],
    ...(input.genres ?? []).map((genre) => ["c", genre, "genre"]),
    ...(input.languages ?? []).map((language) => ["l", language]),
    ...input.streams.map((stream) => [
      "stream",
      normalizeUrl(stream.url),
      stream.format,
      JSON.stringify(stream.quality),
      ...(stream.primary ? ["primary"] : []),
    ]),
  ];

  if (input.thumbnail) tags.push(["thumbnail", input.thumbnail]);
  if (input.website) tags.push(["website", input.website]);
  if (input.location) tags.push(["location", input.location]);
  if (input.countryCode) tags.push(["country", input.countryCode]);

  return {
    kind: STATION_KIND,
    content: JSON.stringify(content),
    tags,
  };
}

export function buildStationDeletionTemplate(
  input: StationDeletionInput
): EventTemplate {
  const tags: string[][] = [
    ["e", input.eventId],
    ["k", String(STATION_KIND)],
    ["p", input.pubkey],
  ];

  if (input.stationId) {
    tags.push(["a", `${STATION_KIND}:${input.pubkey}:${input.stationId}`]);
  }

  return {
    kind: 5,
    content: input.reason ?? "Deleted radio station",
    tags,
  };
}

// ─── Action helpers ──────────────────────────────────────────────────────────

export function buildStationReactionTemplate(
  station: Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">,
  content = "❤️",
): EventTemplate {
  const address = getAddressableIdentity(station);
  return {
    kind: 7,
    content,
    tags: [
      ...(address ? [["a", address]] : []),
      ["e", station.id],
      ["k", String(station.kind)],
    ],
  };
}

export function buildStationCommentTemplate(
  station: Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">,
  content: string,
): EventTemplate {
  const address = getAddressableIdentity(station);
  return {
    kind: 1111,
    content,
    tags: [
      ...(address ? [["A", address]] : []),
      ["K", String(station.kind)],
      ["P", station.pubkey],
      ["e", station.id],
    ],
  };
}

export function buildCommentReplyTemplate(
  parentEvent: Pick<NostrEvent, "id" | "pubkey">,
  stationAddress: string,
  stationId: string,
  content: string,
): EventTemplate {
  return {
    kind: 1111,
    content,
    tags: [
      ["e", parentEvent.id, "", "reply"],
      ["p", parentEvent.pubkey],
      ["A", stationAddress],
      ["e", stationId, "", "root"],
    ],
  };
}
