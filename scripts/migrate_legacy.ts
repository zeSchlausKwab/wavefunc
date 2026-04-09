// migrate_legacy.ts - Convert legacy station data to Nostr events
//
// Pulls real-world stations from radiobrowser exports, dedupes/merges them,
// and publishes the result via the applesauce relay pool. After station
// migration finishes it also seeds dev favorites lists, admin featured
// references, and app-signed featured lists.

import { faker } from "@faker-js/faker";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { EventFactory } from "applesauce-core";
import { RelayPool } from "applesauce-relay";
import { PrivateKeySigner } from "applesauce-signers";
import { hexToBytes } from "@noble/hashes/utils.js";
import { readFileSync } from "fs";
import { getPublicKey } from "nostr-tools/pure";
import path from "path";

import {
  buildAdminFeatureTemplate,
  buildFavoritesListTemplate,
  buildStationTemplate,
  type Stream,
  type StationTemplateInput,
} from "../src/lib/nostr/domain";
import {
  devUser1,
  devUser2,
  devUser3,
  devUser4,
  devUser5,
} from "../src/lib/fixtures";
import {
  getMergeStats,
  groupStationsByKey,
  mergeStations,
} from "./lib/station-merger";
import {
  getCleanStationName,
  normalizeStationNameForGrouping,
} from "./lib/station-normalizer";

// ─── Configuration ───────────────────────────────────────────────────────────

const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
if (!APP_PRIVATE_KEY) {
  console.error("❌ APP_PRIVATE_KEY environment variable is required");
  process.exit(1);
}
const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

function getRelayUrl(): string {
  const relayArg = process.argv.find((arg) => arg.startsWith("--relay="));
  if (relayArg) {
    return relayArg.split("=")[1] || "ws://localhost:3334";
  }
  return process.env.RELAY_URL || "ws://localhost:3334";
}

const RELAY_URL = getRelayUrl();
const IS_LOCAL_RELAY =
  RELAY_URL.includes("localhost") ||
  RELAY_URL.includes("127.0.0.1") ||
  RELAY_URL.includes("10.0.2.2");

const pool = new RelayPool();
pool.relay(RELAY_URL);

const devUsers = [devUser1, devUser2, devUser3, devUser4, devUser5];

// ─── Types ───────────────────────────────────────────────────────────────────

// JSON station record from radiobrowser_stations_latest.json
interface JSONStation {
  stationuuid: string;
  name: string;
  url_stream: string;
  url_homepage: string;
  url_favicon: string;
  tags: string;
  iso_3166_1: string;
  iso_3166_2: string;
  iso_639: string | null;
  geo_lat: number | null;
  geo_long: number | null;
}

// Internal station structure used by merger/normalizer
interface LegacyStation {
  StationID: number;
  Name: string | null;
  Url: string | null;
  Homepage: string | null;
  Favicon: string | null;
  Country: string | null;
  Language: string | null;
  Tags: string | null;
  Votes: number;
  Subcountry: string | null;
  Codec: string | null;
  Bitrate: number;
  UrlCache: string | null;
  Hls: number;
  CountryCode: string | null;
  GeoLat: number | null;
  GeoLong: number | null;
  LanguageCodes: string | null;
  ServerUuid: string | null;
  StationUuid: string;
  _duplicates?: LegacyStation[];
}

// StationCheckHistory for descriptions from SQL
interface StationCheckHistory {
  StationUuid: string;
  Description: string | null;
}

// ─── Publishing helpers ──────────────────────────────────────────────────────

async function publish(event: NostrEvent): Promise<void> {
  await pool.publish([RELAY_URL], event);
}

async function signAndPublish(
  signer: PrivateKeySigner,
  template: EventTemplate,
  extraTags: string[][] = [],
): Promise<NostrEvent> {
  const factory = new EventFactory({ signer });
  const draft = await factory.build({
    ...template,
    tags: [...template.tags, ...extraTags],
  });
  const event = await factory.sign(draft);
  await publish(event);
  return event;
}

// ─── Legacy data loading ─────────────────────────────────────────────────────

const resolvedUrlCache = new Map<string, string>();

async function resolvePlaylistUrl(url: string): Promise<string> {
  const lower = url.toLowerCase();
  if (!lower.endsWith(".pls") && !lower.endsWith(".m3u")) return url;

  if (resolvedUrlCache.has(url)) return resolvedUrlCache.get(url)!;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "RadioBrowser/1.0" },
    });
    if (!response.ok) return url;
    const text = await response.text();

    let resolved = url;
    if (lower.endsWith(".pls")) {
      const match = text.match(/^File\d+=(.+)$/m);
      if (match?.[1]) resolved = match[1].trim();
    } else {
      const line = text
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith("#") && l.startsWith("http"));
      if (line) resolved = line;
    }

    resolvedUrlCache.set(url, resolved);
    return resolved;
  } catch {
    resolvedUrlCache.set(url, url);
    return url;
  }
}

function parseFormatFromName(name: string): { codec: string | null; bitrate: number } {
  const match = name.match(/\((\d+)k?\s*(mp3|aac\+?|ogg|opus|flac)\)/i);
  if (match) {
    return {
      bitrate: parseInt(match[1] || "0"),
      codec: (match[2] || "").toLowerCase().replace("+", ""),
    };
  }
  return { codec: null, bitrate: 0 };
}

function detectHls(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("/hls/");
}

function jsonToStation(j: JSONStation, index: number): LegacyStation {
  const { codec, bitrate } = parseFormatFromName(j.name);
  return {
    StationID: index,
    StationUuid: j.stationuuid,
    Name: j.name || null,
    Url: j.url_stream || null,
    UrlCache: j.url_stream || null,
    Homepage: j.url_homepage || null,
    Favicon: j.url_favicon || null,
    Country: null,
    CountryCode: j.iso_3166_1 || null,
    Language: null,
    LanguageCodes: j.iso_639 || null,
    Tags: j.tags || null,
    Votes: 0,
    Subcountry: j.iso_3166_2 || null,
    Codec: codec,
    Bitrate: bitrate,
    Hls: detectHls(j.url_stream) ? 1 : 0,
    GeoLat: j.geo_lat,
    GeoLong: j.geo_long,
    ServerUuid: null,
  };
}

function loadStationsFromJSON(jsonPath: string): LegacyStation[] {
  console.log("📖 Reading JSON station database...");
  const raw: JSONStation[] = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const stations = raw
    .filter((j) => j.url_stream && j.name)
    .map((j, i) => jsonToStation(j, i));
  console.log(`✅ Found ${stations.length} stations`);
  return stations;
}

function extractStationCheckHistory(
  sqlPath: string,
): Map<string, StationCheckHistory> {
  console.log("📖 Reading SQL dump for descriptions...");
  const sql = readFileSync(sqlPath, "utf-8");
  const lines = sql.split("\n");

  const checkHistory = new Map<string, StationCheckHistory>();
  let inCheckHistory = false;

  for (const line of lines) {
    if (line.includes("INSERT INTO `StationCheckHistory` VALUES")) {
      inCheckHistory = true;
      continue;
    }

    if (inCheckHistory) {
      if (line.trim() === ";") {
        inCheckHistory = false;
        continue;
      }

      const match = line.match(/\(([^)]+)\)/);
      if (!match || !match[1]) continue;

      const parts = match[1]
        .split(",")
        .map((p) => p.trim().replace(/^'|'$/g, ""));
      if (parts.length < 15) continue;

      const stationUuid = parts[1]?.replace(/'/g, "") || "";
      const description = parts[14]?.replace(/'/g, "") || "";

      if (stationUuid && description && description !== "NULL") {
        checkHistory.set(stationUuid, {
          StationUuid: stationUuid,
          Description: description,
        });
      }
    }
  }

  console.log(`✅ Found ${checkHistory.size} stations with descriptions`);
  return checkHistory;
}

// ─── Conversion ──────────────────────────────────────────────────────────────

function getFormat(codec: string | null, hls: number = 0, url: string = ""): string {
  if (hls === 1 || url.toLowerCase().includes(".m3u8")) {
    return "application/x-mpegURL";
  }
  if (!codec) return "audio/mpeg";
  const c = codec.toLowerCase();
  if (c.includes("mp3")) return "audio/mpeg";
  if (c.includes("aac")) return "audio/aac";
  if (c.includes("ogg") || c.includes("vorbis")) return "audio/ogg";
  if (c.includes("opus")) return "audio/opus";
  if (c.includes("flac")) return "audio/flac";
  return "audio/mpeg";
}

function encodeGeohash(lat: number, lon: number, precision: number): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon > lonMid) { idx = (idx << 1) + 1; lonMin = lonMid; }
      else { idx = idx << 1; lonMax = lonMid; }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat > latMid) { idx = (idx << 1) + 1; latMin = latMid; }
      else { idx = idx << 1; latMax = latMid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += base32[idx]; bit = 0; idx = 0; }
  }

  return geohash;
}

async function legacyToStationInput(
  station: LegacyStation,
  checkHistory?: Map<string, StationCheckHistory>,
): Promise<{ input: StationTemplateInput; geohash: string | null }> {
  const duplicates = station._duplicates ?? [station];

  const streams: Stream[] = [];
  const seenUrls = new Set<string>();

  for (const dup of duplicates) {
    const rawUrl = dup.UrlCache || dup.Url;
    if (!rawUrl || seenUrls.has(rawUrl)) continue;

    const url = await resolvePlaylistUrl(rawUrl);
    if (seenUrls.has(url)) continue;

    seenUrls.add(rawUrl);
    seenUrls.add(url);
    streams.push({
      url,
      format: getFormat(dup.Codec, dup.Hls, url),
      quality: {
        bitrate: dup.Bitrate * 1000,
        codec: (dup.Codec || "mp3").toLowerCase(),
        sampleRate: 44100,
      },
      primary: streams.length === 0,
    });
  }

  if (streams.length > 1) {
    streams.sort((a, b) => b.quality.bitrate - a.quality.bitrate);
    streams.forEach((s, i) => (s.primary = i === 0));
  }

  const extendedInfo = checkHistory?.get(station.StationUuid);
  const description =
    extendedInfo?.Description ||
    station.Tags ||
    station.Name ||
    "Internet radio station";

  const location = station.Subcountry
    ? `${station.Subcountry}, ${station.CountryCode || ""}`.trim().replace(/,\s*$/, "")
    : station.CountryCode || "";

  const genres = station.Tags
    ? station.Tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  const languages = station.LanguageCodes
    ? station.LanguageCodes.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)
    : [];

  const input: StationTemplateInput = {
    stationId: station.StationUuid,
    name: station.Name || "Unknown Station",
    description,
    streams,
    ...(station.Favicon ? { thumbnail: station.Favicon } : {}),
    ...(station.Homepage ? { website: station.Homepage } : {}),
    ...(location ? { location } : {}),
    ...(station.CountryCode ? { countryCode: station.CountryCode } : {}),
    genres,
    languages,
  };

  const geohash =
    station.GeoLat != null && station.GeoLong != null
      ? encodeGeohash(station.GeoLat, station.GeoLong, 7)
      : null;

  return { input, geohash };
}

function selectRandomStations(
  stations: LegacyStation[],
  count: number,
): LegacyStation[] {
  console.log("🔍 Deduplicating stations...");

  const groups = groupStationsByKey(stations, normalizeStationNameForGrouping);

  console.log(
    `   Found ${groups.size} unique stations (from ${stations.length} total)`,
  );

  const uniqueStations: LegacyStation[] = [];
  let multiStreamCount = 0;

  for (const duplicates of groups.values()) {
    if (duplicates.length === 0) continue;
    const firstStation = duplicates[0];
    if (!firstStation) continue;

    const merged = mergeStations(duplicates);
    const stats = getMergeStats(duplicates, merged);

    if (duplicates.length > 1) {
      console.log(
        `   📎 Merged ${duplicates.length}x "${getCleanStationName(firstStation)}" → ${stats.streamCount} streams`,
      );
      if (stats.streamCount > 1) multiStreamCount++;
    }

    uniqueStations.push(merged);
  }

  console.log(
    `\n   📊 ${uniqueStations.length} unique stations (${multiStreamCount} with multiple streams)`,
  );

  const shuffled = [...uniqueStations].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, uniqueStations.length));
}

// ─── Seed phases (favorites + admin + featured) ──────────────────────────────

async function seedFavoritesLists(stationAddresses: string[]): Promise<string[]> {
  console.log("\n❤️  Seeding favorites lists...");

  if (stationAddresses.length === 0) {
    console.log("⚠️  No stations available for favorites lists");
    return [];
  }

  const createdFavoritesAddresses: string[] = [];
  let favoritesCount = 0;

  for (let userIndex = 0; userIndex < devUsers.length; userIndex++) {
    const user = devUsers[userIndex]!;
    const signer = PrivateKeySigner.fromKey(user.sk);
    const pubkey = await signer.getPublicKey();

    faker.seed(userIndex + 5000);

    for (let listIndex = 0; listIndex < 3; listIndex++) {
      try {
        const musicGenre = faker.music.genre();
        const adjective = faker.word.adjective();

        const listConfigs = [
          {
            name: `${faker.helpers.arrayElement(["My", "Best", "Top", "Favorite"])} ${musicGenre} Stations`,
            desc: `${faker.helpers.arrayElement(["A curated collection of", "My favorite", "The best", "Premium selection of"])} ${musicGenre.toLowerCase()} radio stations`,
            banner: `https://picsum.photos/seed/${faker.string.alphanumeric(10)}/1200/400`,
          },
          {
            name: `${adjective.charAt(0).toUpperCase() + adjective.slice(1)} ${faker.helpers.arrayElement(["Vibes", "Mix", "Playlist", "Collection"])}`,
            desc: `${faker.helpers.arrayElement(["Perfect for", "Great for", "Ideal for"])} ${faker.helpers.arrayElement(["relaxing", "working", "studying", "partying", "driving"])}`,
            banner: `https://picsum.photos/seed/${faker.string.alphanumeric(10)}/1200/400`,
          },
          {
            name: `${faker.helpers.arrayElement(["Weekend", "Morning", "Evening", "Night", "Road Trip"])} Radio`,
            desc: faker.lorem.sentence(),
            banner: `https://picsum.photos/seed/${faker.string.alphanumeric(10)}/1200/400`,
          },
        ];

        const listInfo = listConfigs[listIndex]!;
        const numStations = faker.number.int({ min: 5, max: 8 });
        const selected = faker.helpers.arrayElements(
          stationAddresses,
          Math.min(numStations, stationAddresses.length),
        );

        const template = buildFavoritesListTemplate({
          name: listInfo.name,
          description: listInfo.desc,
          banner: listInfo.banner,
          stationAddresses: selected,
        });

        const event = await signAndPublish(signer, template);
        const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
        if (dTag) {
          createdFavoritesAddresses.push(`30078:${pubkey}:${dTag}`);
        }

        favoritesCount++;
        console.log(`  ✓ "${listInfo.name}" — ${selected.length} stations`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`  ✗ Failed for user ${userIndex}:`, error);
      }
    }
  }

  console.log(`\n✅ Seeded ${favoritesCount} favorites lists`);
  return createdFavoritesAddresses;
}

async function seedAdminFeaturedReferences(favoritesAddresses: string[]): Promise<void> {
  if (!IS_LOCAL_RELAY || favoritesAddresses.length === 0) return;

  console.log("\n🛡️  Seeding admin featured list references...");

  const adminSigner = PrivateKeySigner.fromKey(devUser1.sk);
  const refs = favoritesAddresses.slice(0, 6);

  const template = buildAdminFeatureTemplate({
    type: "lists",
    featureId: "wavefunc-dev-featured-lists",
    refs,
  });

  await signAndPublish(adminSigner, template);
  console.log(`✅ Seeded admin references for ${refs.length} favorites lists`);
}

async function seedFeaturedLists(stationAddresses: string[]): Promise<void> {
  console.log("\n🌟 Seeding featured lists (app-signed)...");

  const appSigner = PrivateKeySigner.fromKey(APP_PRIVATE_KEY!);
  const featuredListsConfig = [
    { name: "Staff Picks",      desc: "Our favorite stations handpicked by the Wavefunc team", banner: "https://picsum.photos/seed/staff/1200/400" },
    { name: "New & Noteworthy", desc: "Recently added stations worth checking out",            banner: "https://picsum.photos/seed/new/1200/400" },
  ] as const;

  let featuredCount = 0;
  for (const listConfig of featuredListsConfig) {
    try {
      const numStations = faker.number.int({ min: 6, max: 8 });
      const selected = faker.helpers.arrayElements(
        stationAddresses,
        Math.min(numStations, stationAddresses.length),
      );

      const template = buildFavoritesListTemplate({
        name: listConfig.name,
        description: listConfig.desc,
        banner: listConfig.banner,
        stationAddresses: selected,
      });

      await signAndPublish(appSigner, template);
      featuredCount++;
      console.log(`  ✓ "${listConfig.name}" — ${selected.length} stations`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.error(`  ✗ Failed to create "${listConfig.name}":`, error);
    }
  }

  console.log(`\n✅ Seeded ${featuredCount} featured lists`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function migrateStations() {
  console.log("🚀 Starting station migration...\n");

  const jsonPath = path.join(process.cwd(), "legacy-db", "radiobrowser_stations_latest.json");
  const sqlPath = path.join(process.cwd(), "legacy-db", "latest.sql");

  const allStations = loadStationsFromJSON(jsonPath);

  let checkHistory: Map<string, StationCheckHistory> | undefined;
  try {
    checkHistory = extractStationCheckHistory(sqlPath);
  } catch {
    console.log("⚠️  SQL dump not found — skipping description enrichment");
  }

  const countArg = process.argv.find((arg, i) => i > 1 && !arg.startsWith("--"));
  const count = countArg ? parseInt(countArg) : 500;
  const selectedStations = selectRandomStations(allStations, count);
  console.log(`📊 Selected ${selectedStations.length} unique stations\n`);

  console.log(`🔌 Publishing to relay: ${RELAY_URL}\n`);

  const appSigner = PrivateKeySigner.fromKey(APP_PRIVATE_KEY!);
  let successCount = 0;
  let failCount = 0;
  const stationAddresses: string[] = [];

  for (let i = 0; i < selectedStations.length; i++) {
    const station = selectedStations[i];
    if (!station) continue;

    const duplicates = station._duplicates ?? [station];
    const streamCount = new Set(
      duplicates.map((d) => d.UrlCache || d.Url).filter(Boolean),
    ).size;
    const streamInfo = streamCount > 1 ? ` (${streamCount} streams)` : "";

    console.log(`[${i + 1}/${selectedStations.length}] ${station.Name}${streamInfo}`);

    try {
      const { input, geohash } = await legacyToStationInput(station, checkHistory);
      if (input.streams.length === 0) {
        console.log(`  ⚠️  Skipping — no playable streams`);
        continue;
      }

      const template = buildStationTemplate(input);
      const extraTags: string[][] = geohash ? [["g", geohash]] : [];
      const event = await signAndPublish(appSigner, template, extraTags);

      successCount++;
      stationAddresses.push(`31237:${APP_PUBKEY}:${input.stationId}`);
      console.log(`  ✅ ${event.id?.substring(0, 16)}...`);
    } catch (error) {
      failCount++;
      console.error(`  ❌ ${error}`);
    }
  }

  console.log(`\n📊 Migration complete — ${successCount} published, ${failCount} failed`);

  if (successCount > 0) {
    const favoritesAddresses = await seedFavoritesLists(stationAddresses);
    await seedAdminFeaturedReferences(favoritesAddresses);
    await seedFeaturedLists(stationAddresses);
  }

  process.exit(0);
}

migrateStations().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
