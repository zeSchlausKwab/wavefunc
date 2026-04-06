import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { z } from "zod";
import {
  getAddressableReferences,
  getFirstTagValue,
  getMatchingTags,
  parseJsonContent,
} from "./shared";

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
  streams: Stream[];
  streamingServerUrl?: string;
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
  const content = parseJsonContent<StationContent>(event.content);
  const tagStreams = getMatchingTags(event, "stream")
    .map(parseStreamTag)
    .filter((stream): stream is Stream => stream !== null);
  const streams = tagStreams.length > 0 ? tagStreams : content?.streams ?? [];
  const refs = getAddressableReferences(event, relays);

  return {
    event,
    kind: STATION_KIND,
    stationId: getFirstTagValue(event, "d"),
    name: getFirstTagValue(event, "name"),
    description: getFirstTagValue(event, "description") ?? content?.description,
    thumbnail: getFirstTagValue(event, "thumbnail"),
    website: getFirstTagValue(event, "website"),
    location: getFirstTagValue(event, "location"),
    countryCode: getFirstTagValue(event, "country"),
    streams,
    streamingServerUrl: content?.streamingServerUrl,
    ...refs,
  };
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

