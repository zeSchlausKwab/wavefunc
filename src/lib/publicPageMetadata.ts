import type { NostrEvent } from "applesauce-core/helpers/event";
import { naddrEncode, npubEncode } from "nostr-tools/nip19";
import { parseJsonContent } from "./nostr/domain/shared";
import { parseStationEvent } from "./nostr/domain/station";
import { parseFavoritesListEvent } from "./nostr/domain/favorites-list";

import { genrePath, genresPath, type GenreEntry } from "./genres";

const SITE = "https://wavefunc.live";
const DEFAULT_IMAGE = SITE + "/images/og-image.png";

export type PublicPage =
  | { kind: "home" }
  | { kind: "apps" }
  | { kind: "station"; event: NostrEvent }
  | { kind: "collection"; event: NostrEvent; stations: NostrEvent[] }
  | { kind: "genres"; genres: GenreEntry[]; page: number; query: string; total: number }
  | { kind: "genre"; genre: GenreEntry; page: number; events: NostrEvent[] }
  | { kind: "profile"; pubkey: string; event?: NostrEvent }
  | { kind: "unavailable" | "not-found"; path: string };

interface PublicPageMetadata {
  heading: string;
  title: string;
  description: string;
  image: string;
  canonical?: string;
  indexable: boolean;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Public event fields may contain arbitrary URLs. Only link to web resources. */
export function publicWebUrl(value: unknown): string | undefined {
  const href = text(value);
  if (!href) return;
  try {
    const url = href.startsWith("/") ? new URL(href, SITE) : new URL(href);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {
    // A malformed optional link doesn't invalidate a signed station or profile.
  }
}

/** Relay hints can vary between shares of one addressable event. Keep one permalink. */
export function publicEventPointer(event: NostrEvent): string {
  const identifier = event.tags.find(tag => tag[0] === "d")?.[1] ?? "";
  return naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier });
}

export { publicEventPointer as publicStationPointer };

export function publicStationPath(event: NostrEvent): string {
  return "/station/" + publicEventPointer(event);
}

export function publicCollectionPath(event: NostrEvent): string {
  return "/collection/" + publicEventPointer(event);
}

function metadata(heading: string, title: string, description: string, path?: string, image?: string): PublicPageMetadata {
  return { heading, title, description, image: image ?? DEFAULT_IMAGE, canonical: path ? SITE + path : undefined, indexable: !!path };
}

export const genericPageMetadata = metadata("WaveFunc Radio", "WaveFunc Radio", "Decentralized internet radio directory and player built on Nostr");

export function describePublicPage(page: PublicPage): PublicPageMetadata {
  switch (page.kind) {
    case "home":
      return metadata("WaveFunc Radio", "WaveFunc Radio | Discover live internet radio", "Explore internet radio stations by genre, listen live, and share your favorite stations on Nostr.", "/");
    case "apps":
      return metadata("WaveFunc apps", "Download WaveFunc for Android and desktop | WaveFunc Radio", "Listen to internet radio and back up songs from your Crate with WaveFunc on Android, macOS, Windows, or Linux.", "/apps");
    case "genres": {
      const name = page.query ? `Radio genres matching “${page.query}”` : "Browse radio stations by genre";
      const title = name + (page.page === 1 ? "" : " – Page " + page.page) + " | WaveFunc Radio";
      return { ...metadata("Radio genres", title, "Find a genre and explore its live radio stations.", genresPath(page.page, page.query)), indexable: !page.query };
    }
    case "genre": {
      const heading = page.genre.name + " radio stations";
      const count = page.genre.count;
      const description = `Browse the latest ${page.genre.name} listings from a directory of ${count} radio ${count === 1 ? "station" : "stations"} and listen live on WaveFunc.`;
      return metadata(heading, heading + " | WaveFunc Radio", description, genrePath(page.genre.slug));
    }
    case "station": {
      const station = parseStationEvent(page.event);
      const name = text(station.name) || "Radio station";
      return metadata(name, name + " | WaveFunc Radio", text(station.description) || `Listen to ${name} live on WaveFunc Radio.`, publicStationPath(page.event), publicWebUrl(station.thumbnail));
    }
    case "collection": {
      const list = parseFavoritesListEvent(page.event);
      const name = text(list.name) || "Station collection";
      return metadata(name, name + " | WaveFunc Radio", text(list.description) || `Listen to the stations in ${name} on WaveFunc Radio.`, publicCollectionPath(page.event), publicWebUrl(list.banner) || publicWebUrl(list.image));
    }
    case "profile": {
      const profile = page.event ? parseJsonContent<Record<string, unknown>>(page.event.content) : undefined;
      const npub = npubEncode(page.pubkey);
      const name = text(profile?.display_name) || text(profile?.displayName) || text(profile?.name) || `${npub.slice(0, 12)}…${npub.slice(-4)}`;
      return metadata(name, name + " | WaveFunc Radio", text(profile?.about) || `View the Nostr profile for ${name} on WaveFunc Radio.`, "/profile/" + npub, publicWebUrl(profile?.picture) || publicWebUrl(profile?.image));
    }
    case "unavailable":
      return metadata("Radio directory temporarily unavailable", "Temporarily unavailable | WaveFunc Radio", "The radio directory could not load this page. Please try again shortly.");
    case "not-found":
      return metadata("Page not found", "Page not found | WaveFunc Radio", "This page could not be found in the radio directory.");
  }
}

type MetaTag = { attribute: "name" | "property"; key: string; content: string };

export function getPublicMetaTags({ title, description, image, canonical, indexable }: PublicPageMetadata): MetaTag[] {
  const tags: MetaTag[] = [
    { attribute: "name", key: "title", content: title },
    { attribute: "name", key: "description", content: description },
    { attribute: "property", key: "og:title", content: title },
    { attribute: "property", key: "og:description", content: description },
    { attribute: "property", key: "og:type", content: "website" },
    { attribute: "property", key: "og:image", content: image },
    { attribute: "property", key: "og:logo", content: SITE + "/images/logo.png" },
    { attribute: "property", key: "og:site_name", content: "WaveFunc Radio" },
    { attribute: "name", key: "twitter:card", content: "summary_large_image" },
    { attribute: "name", key: "twitter:title", content: title },
    { attribute: "name", key: "twitter:description", content: description },
    { attribute: "name", key: "twitter:image", content: image },
    { attribute: "name", key: "twitter:image:alt", content: title },
    { attribute: "name", key: "telegram:title", content: title },
    { attribute: "name", key: "telegram:description", content: description },
    { attribute: "name", key: "telegram:image", content: image },
  ];
  if (canonical) tags.push({ attribute: "property", key: "og:url", content: canonical });
  if (!indexable) tags.push({ attribute: "name", key: "robots", content: "noindex" });
  return tags;
}
