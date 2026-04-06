import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import {
  getAddressableReferences,
  getFirstTagValue,
  getMatchingTags,
} from "./shared";

export const SONG_KIND = 31337;

export type SongMetadataInput = {
  song?: string;
  artist?: string;
  musicBrainz?: {
    id: string;
    title: string;
    artist: string;
    release?: string;
    releaseId?: string;
    releaseDate?: string;
    duration?: number;
    tags?: string[];
  };
};

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function isSongEvent(event: NostrEvent): boolean {
  return event.kind === SONG_KIND;
}

export function parseSongEvent(event: NostrEvent, relays?: string[]) {
  const refs = getAddressableReferences(event, relays);

  return {
    event,
    kind: SONG_KIND,
    songId: getFirstTagValue(event, "d"),
    title: getFirstTagValue(event, "title"),
    artist: event.tags.find((tag) => tag[0] === "c" && tag[2] === "artist")?.[1],
    album: event.tags.find((tag) => tag[0] === "c" && tag[2] === "album")?.[1],
    mbid: event.tags
      .find((tag) => tag[0] === "i" && tag[1]?.startsWith("mbid:"))?.[1]
      ?.slice(5),
    releaseId: event.tags
      .find((tag) => tag[0] === "i" && tag[1]?.startsWith("release-mbid:"))?.[1]
      ?.slice(13),
    coverArt: getFirstTagValue(event, "image"),
    thumb: getFirstTagValue(event, "thumb"),
    duration: getFirstTagValue(event, "duration")
      ? parseInt(getFirstTagValue(event, "duration")!, 10)
      : undefined,
    releaseYear: getFirstTagValue(event, "published_at")
      ? new Date(parseInt(getFirstTagValue(event, "published_at")!, 10) * 1000)
          .getUTCFullYear()
      : undefined,
    genres: getMatchingTags(event, "t")
      .map((tag) => tag[1])
      .filter((tag): tag is string => Boolean(tag)),
    audioUrl: getFirstTagValue(event, "r"),
    youtubeId: event.tags
      .find((tag) => tag[0] === "i" && tag[1]?.startsWith("youtube:"))?.[1]
      ?.slice(8),
    ...refs,
  };
}

export function buildSongTemplateFromMetadata(
  metadata: SongMetadataInput
): EventTemplate {
  const mb = metadata.musicBrainz;
  const title = mb?.title || metadata.song || "";
  const artist = mb?.artist || metadata.artist || "";
  const songId = mb?.id
    ? `mb-${mb.id}`
    : slugify(`${title}-by-${artist}`) || crypto.randomUUID();

  const tags: string[][] = [
    ["d", songId],
    ["title", title],
  ];

  if (artist) tags.push(["c", artist, "artist"]);
  if (mb?.release) tags.push(["c", mb.release, "album"]);
  if (mb?.id) tags.push(["i", `mbid:${mb.id}`]);

  if (mb?.releaseId) {
    tags.push(["i", `release-mbid:${mb.releaseId}`]);
    tags.push([
      "image",
      `https://coverartarchive.org/release/${mb.releaseId}/front-500`,
    ]);
    tags.push([
      "thumb",
      `https://coverartarchive.org/release/${mb.releaseId}/front-250`,
    ]);
  }

  if (mb?.duration) {
    tags.push(["duration", Math.round(mb.duration / 1000).toString()]);
  }

  if (mb?.releaseDate) {
    const year = parseInt(mb.releaseDate.split("-")[0] || "", 10);
    if (!Number.isNaN(year)) {
      tags.push([
        "published_at",
        Math.floor(Date.UTC(year, 0, 1) / 1000).toString(),
      ]);
    }
  }

  if (mb?.tags) {
    for (const genre of mb.tags.slice(0, 5)) {
      tags.push(["t", genre]);
    }
  }

  return {
    kind: SONG_KIND,
    content: "",
    tags,
  };
}

export function buildSongAudioUpdateTemplate(
  event: NostrEvent,
  audioUrl: string,
  youtubeId?: string
): EventTemplate {
  const tags = event.tags.filter(
    (tag) =>
      !(tag[0] === "r" || (tag[0] === "i" && tag[1]?.startsWith("youtube:")))
  );

  tags.push(["r", audioUrl]);
  if (youtubeId) {
    tags.push(["i", `youtube:${youtubeId}`]);
  }

  return {
    kind: SONG_KIND,
    content: event.content,
    tags,
  };
}

