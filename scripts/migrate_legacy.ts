// migrate_legacy.ts - Convert legacy MariaDB station data to Nostr events
import { hexToBytes } from "@noble/hashes/utils";
import NDK, { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getPublicKey } from "nostr-tools/pure";
import { readFileSync } from "fs";
import path from "path";
import {
  createGroupingKey,
  getCleanStationName,
  normalizeStationNameForGrouping,
  areRelatedUrls,
} from "./lib/station-normalizer";
import {
  mergeStations,
  getMergeStats,
  groupStationsByNameAndUrl,
} from "./lib/station-merger";
import { faker } from "@faker-js/faker";
import { NDKWFFavorites } from "../src/lib/NDKWFFavorites";
import {
  devUser1,
  devUser2,
  devUser3,
  devUser4,
  devUser5,
} from "../src/lib/fixtures";

// App key for publishing stations - must be set in environment
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY;
if (!APP_PRIVATE_KEY) {
  console.error("❌ APP_PRIVATE_KEY environment variable is required");
  process.exit(1);
}
const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

// Parse relay URL from command line
// Usage: bun run scripts/migrate_legacy.ts [count] [--relay=URL]
function getRelayUrl(): string {
  const relayArg = process.argv.find((arg) => arg.startsWith("--relay="));
  if (relayArg) {
    const url = relayArg.split("=")[1];
    return url || "ws://localhost:3334";
  }
  return process.env.RELAY_URL || "ws://localhost:3334";
}

const RELAY_URL = getRelayUrl();
const ndk = new NDK({
  explicitRelayUrls: [RELAY_URL],
  enableOutboxModel: false,
});

// Legacy DB Station structure
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
}

// StationCheckHistory for descriptions and extended metadata
interface StationCheckHistory {
  StationUuid: string;
  Description: string | null;
  Name: string | null;
  Tags: string | null;
  Favicon: string | null;
  Homepage: string | null;
  MetainfoOverridesDatabase: number;
}

// StreamingServers for streamingServerUrl
interface StreamingServer {
  Uuid: string;
  Url: string;
  Software: string | null;
  Location: string | null;
}

// Parse a single station INSERT line from SQL
function parseStationInsert(line: string): LegacyStation | null {
  // Extract values from INSERT statement
  // Format: (1,'Name','url',...),
  const match = line.match(/\(([^)]+)\)/);
  if (!match || !match[1]) return null;

  // Properly parse CSV-like values respecting quotes
  const values: (string | null)[] = [];
  let current = "";
  let inQuote = false;
  let escaped = false;

  for (let i = 0; i < match[1].length; i++) {
    const char = match[1][i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "'") {
      inQuote = !inQuote;
      continue;
    }

    if (char === "," && !inQuote) {
      const trimmed = current.trim();
      values.push(trimmed === "NULL" ? null : trimmed);
      current = "";
      continue;
    }

    current += char;
  }

  // Push last value
  const trimmed = current.trim();
  values.push(trimmed === "NULL" ? null : trimmed);

  if (values.length < 25) {
    console.warn(`Skipping station - insufficient values: ${values.length}`);
    return null;
  }

  // Debug first station to verify indices
  if (values[0] === "1") {
    console.log("DEBUG: First station values:", values.slice(0, 30));
  }

  const station: LegacyStation = {
    StationID: parseInt(values[0] as string),
    Name: values[1] || null,
    Url: values[2] || null,
    Homepage: values[3] || null,
    Favicon: values[4] || null,
    Country: values[6] || null,
    Language: values[7] || null,
    Tags: values[8] || null,
    Votes: parseInt(values[9] as string) || 0,
    Subcountry: values[10] || null,
    Codec: values[14] || null,
    Bitrate: parseInt(values[17] as string) || 0,
    UrlCache: values[18] || null,
    Hls: parseInt(values[20] as string) || 0,
    CountryCode: values[23] || null,
    GeoLat: values[26] ? parseFloat(values[26] as string) : null,
    GeoLong: values[27] ? parseFloat(values[27] as string) : null,
    LanguageCodes: values[29] || null,
    ServerUuid: values[31] || null,
    StationUuid: values[22] || `legacy-${values[0]}`,
  };

  // Validate critical fields
  if (!station.Url || station.Url.length < 5) {
    console.warn(
      `Skipping station "${station.Name}" - invalid URL: ${station.Url}`
    );
    return null;
  }

  return station;
}

// Convert legacy station to Nostr event
async function legacyToNostrEvent(
  station: LegacyStation,
  signer: NDKPrivateKeySigner,
  checkHistory?: Map<string, StationCheckHistory>,
  servers?: Map<string, StreamingServer>
): Promise<NDKEvent> {
  const event = new NDKEvent(ndk);
  event.kind = 31237; // Radio Station Event

  // Get all duplicate stations if they exist
  const duplicates = (station as any)._duplicates || [station];

  // Build streams from all duplicates
  const streams: any[] = [];
  const seenUrls = new Set<string>();

  for (const dup of duplicates) {
    const url = dup.UrlCache || dup.Url;
    if (!url || seenUrls.has(url)) continue;

    seenUrls.add(url);
    streams.push({
      url,
      format: getFormat(dup.Codec, dup.Hls),
      quality: {
        bitrate: dup.Bitrate * 1000, // Convert to bps
        codec: (dup.Codec || "mp3").toLowerCase(),
        sampleRate: 44100, // Default, not in legacy DB
      },
      primary: streams.length === 0, // First stream is primary
    });
  }

  // Sort by bitrate (highest first) and mark highest as primary
  if (streams.length > 1) {
    streams.sort((a, b) => b.quality.bitrate - a.quality.bitrate);
    streams.forEach((s, i) => (s.primary = i === 0));
  }

  // Get description from StationCheckHistory if available
  const extendedInfo = checkHistory?.get(station.StationUuid);
  let description =
    station.Tags || `${station.Name} - ${station.Country || "Unknown"}`;

  if (extendedInfo?.Description) {
    description = extendedInfo.Description;
  }

  // Get streamingServerUrl if available
  const streamingServer = station.ServerUuid
    ? servers?.get(station.ServerUuid)
    : undefined;

  // Build content JSON
  const content: any = {
    description,
    streams,
  };

  // Add streamingServerUrl if available (per SPEC)
  if (streamingServer?.Url) {
    content.streamingServerUrl = streamingServer.Url;
  }

  event.content = JSON.stringify(content);

  // Build tags
  const tags: string[][] = [
    ["d", station.StationUuid], // Unique identifier
    ["name", station.Name || "Unknown Station"],
  ];

  // Add optional tags
  if (station.CountryCode) {
    tags.push(["countryCode", station.CountryCode]);
  }

  // Build location string - use Subcountry if available for better precision
  let location = station.Country || "";
  if (station.Subcountry && station.Subcountry.trim()) {
    location = `${station.Subcountry}, ${station.Country}`;
  }

  if (location) {
    tags.push(["location", location]);
  }

  if (station.Homepage) {
    tags.push(["website", station.Homepage]);
  }

  if (station.Favicon) {
    tags.push(["thumbnail", station.Favicon]);
  }

  // Parse and add language codes
  if (station.LanguageCodes) {
    const langCodes = station.LanguageCodes.split(",").filter((l) => l.trim());
    langCodes.forEach((lang) => {
      tags.push(["l", lang.trim().toLowerCase()]);
    });
  } else if (station.Language) {
    tags.push(["l", station.Language.toLowerCase()]);
  }

  // Parse and add tags (genres)
  if (station.Tags) {
    const genres = station.Tags.split(",").filter((t) => t.trim());
    genres.forEach((genre) => {
      tags.push(["c", genre.trim().toLowerCase(), "genre"]);
    });
  }

  // Add geohash if we have coordinates
  if (station.GeoLat && station.GeoLong) {
    const geohash = encodeGeohash(station.GeoLat, station.GeoLong, 7);
    tags.push(["g", geohash]);
  }

  event.tags = tags;

  // Set the signer and sign the event
  event.ndk = ndk;
  await event.sign(signer);

  return event;
}

// Get MIME format from codec and HLS flag
function getFormat(codec: string | null, hls: number = 0): string {
  // HLS streams (m3u8) use application/x-mpegURL or application/vnd.apple.mpegurl
  if (hls === 1) {
    return "application/x-mpegURL";
  }

  if (!codec) return "audio/mpeg";

  const c = codec.toLowerCase();
  if (c.includes("mp3")) return "audio/mpeg";
  if (c.includes("aac")) return "audio/aac";
  if (c.includes("ogg") || c.includes("vorbis")) return "audio/ogg";
  if (c.includes("opus")) return "audio/opus";
  if (c.includes("flac")) return "audio/flac";

  return "audio/mpeg"; // Default
}

// Simple geohash encoder
function encodeGeohash(lat: number, lon: number, precision: number): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90,
    latMax = 90;
  let lonMin = -180,
    lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon > lonMid) {
        idx = (idx << 1) + 1;
        lonMin = lonMid;
      } else {
        idx = idx << 1;
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat > latMid) {
        idx = (idx << 1) + 1;
        latMin = latMid;
      } else {
        idx = idx << 1;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += base32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

// Extract StationCheckHistory for descriptions
function extractStationCheckHistory(
  sqlPath: string
): Map<string, StationCheckHistory> {
  console.log("📖 Reading StationCheckHistory for descriptions...");
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

      // Parse StationCheckHistory row
      const match = line.match(/\(([^)]+)\)/);
      if (!match || !match[1]) continue;

      // Simple parse - just get the fields we need
      const parts = match[1]
        .split(",")
        .map((p) => p.trim().replace(/^'|'$/g, ""));
      if (parts.length < 15) continue;

      const stationUuid = parts[1]?.replace(/'/g, "") || "";
      const description = parts[14]?.replace(/'/g, "") || "";

      if (stationUuid && description && description !== "NULL") {
        // Keep the most recent entry (last one wins)
        checkHistory.set(stationUuid, {
          StationUuid: stationUuid,
          Description: description,
          Name: parts[13]?.replace(/'/g, "") || null,
          Tags: parts[15]?.replace(/'/g, "") || null,
          Favicon: parts[18]?.replace(/'/g, "") || null,
          Homepage: parts[17]?.replace(/'/g, "") || null,
          MetainfoOverridesDatabase: parseInt(parts[11] || "0") || 0,
        });
      }
    }
  }

  console.log(`✅ Found ${checkHistory.size} stations with extended metadata`);
  return checkHistory;
}

// Extract StreamingServers for streamingServerUrl
function extractStreamingServers(
  sqlPath: string
): Map<string, StreamingServer> {
  console.log("📖 Reading StreamingServers...");
  const sql = readFileSync(sqlPath, "utf-8");
  const lines = sql.split("\n");

  const servers = new Map<string, StreamingServer>();
  let inServers = false;

  for (const line of lines) {
    if (line.includes("INSERT INTO `StreamingServers` VALUES")) {
      inServers = true;
      continue;
    }

    if (inServers) {
      if (line.trim() === ";") {
        inServers = false;
        continue;
      }

      // Parse StreamingServer row
      const match = line.match(/\(([^)]+)\)/);
      if (!match || !match[1]) continue;

      const parts = match[1]
        .split(",")
        .map((p) => p.trim().replace(/^'|'$/g, ""));
      if (parts.length < 4) continue;

      const uuid = parts[1]?.replace(/'/g, "") || "";
      const url = parts[2]?.replace(/'/g, "") || "";

      if (uuid && url) {
        servers.set(uuid, {
          Uuid: uuid,
          Url: url,
          Software: parts[9]?.replace(/'/g, "") || null,
          Location: parts[8]?.replace(/'/g, "") || null,
        });
      }
    }
  }

  console.log(`✅ Found ${servers.size} streaming servers`);
  return servers;
}

// Extract stations from SQL dump
function extractStationsFromSQL(sqlPath: string): LegacyStation[] {
  console.log("📖 Reading SQL dump...");
  const sql = readFileSync(sqlPath, "utf-8");
  const lines = sql.split("\n");

  const stations: LegacyStation[] = [];
  let inStationInsert = false;

  for (const line of lines) {
    if (line.includes("INSERT INTO `Station` VALUES")) {
      inStationInsert = true;
      continue;
    }

    if (inStationInsert) {
      if (line.trim() === ";") {
        inStationInsert = false;
        continue;
      }

      const station = parseStationInsert(line);
      if (station && station.Name && station.Url) {
        stations.push(station);
      }
    }
  }

  console.log(`✅ Found ${stations.length} stations in database`);
  return stations;
}

// Randomly select N stations (after deduplication using enhanced grouping)
function selectRandomStations(
  stations: LegacyStation[],
  count: number
): LegacyStation[] {
  console.log(
    "🔍 Deduplicating stations with enhanced URL pattern matching..."
  );

  // Use the enhanced grouping algorithm that considers both name and URL patterns
  const groups = groupStationsByNameAndUrl(
    stations,
    normalizeStationNameForGrouping,
    areRelatedUrls
  );

  console.log(
    `   Found ${groups.size} unique stations (from ${stations.length} total)`
  );

  // Merge duplicates using enrichment logic
  const uniqueStations: LegacyStation[] = [];
  let enrichmentCount = 0;
  let multiStreamCount = 0;

  for (const duplicates of groups.values()) {
    if (duplicates.length === 0) continue; // Safety check

    const firstStation = duplicates[0];
    if (!firstStation) continue; // TypeScript safety

    const merged = mergeStations(duplicates);
    const stats = getMergeStats(duplicates, merged);

    if (duplicates.length > 1) {
      console.log(
        `   📎 Merging ${duplicates.length} versions of "${getCleanStationName(
          firstStation
        )}" → ${stats.streamCount} streams`
      );

      if (stats.enrichedFields.length > 0) {
        console.log(`      ✨ Enriched: ${stats.enrichedFields.join(", ")}`);
        enrichmentCount++;
      }

      if (stats.streamCount > 1) {
        multiStreamCount++;
      }
    }

    uniqueStations.push(merged);
  }

  console.log(`\n   📊 Grouping Statistics:`);
  console.log(`      Total unique stations: ${uniqueStations.length}`);
  console.log(`      Stations with multiple streams: ${multiStreamCount}`);
  if (enrichmentCount > 0) {
    console.log(
      `      ✨ Enriched ${enrichmentCount} stations with additional metadata`
    );
  }

  // Randomly select
  const shuffled = [...uniqueStations].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, uniqueStations.length));
}

// Seed favorites lists for dev users with migrated stations
async function seedFavoritesLists(publishedEvents: NDKEvent[]) {
  console.log("\n❤️  Starting favorites lists seeding...");

  const devUsers = [devUser1, devUser2, devUser3, devUser4, devUser5];
  const stationAddresses = publishedEvents.map((event) => {
    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    return `31237:${event.pubkey}:${dTag}`;
  });

  if (stationAddresses.length === 0) {
    console.log("⚠️  No stations available for favorites lists");
    return;
  }

  let favoritesCount = 0;

  for (let userIndex = 0; userIndex < devUsers.length; userIndex++) {
    const user = devUsers[userIndex];
    if (!user) continue;

    const signer = new NDKPrivateKeySigner(user.sk);
    await signer.blockUntilReady();
    const pubkey = (await signer.user()).pubkey;

    console.log(
      `Creating favorites lists for user ${pubkey.substring(0, 8)}...`
    );

    // Seed faker for consistent but varied results per user
    faker.seed(userIndex + 5000);

    // Generate 3 unique lists with faker
    const listCount = 3;
    for (let listIndex = 0; listIndex < listCount; listIndex++) {
      try {
        // Generate unique list metadata with faker
        const musicGenre = faker.music.genre();
        const adjective = faker.word.adjective();

        const listNames = [
          {
            name: `${faker.helpers.arrayElement([
              "My",
              "Best",
              "Top",
              "Favorite",
            ])} ${musicGenre} Stations`,
            desc: `${faker.helpers.arrayElement([
              "A curated collection of",
              "My favorite",
              "The best",
              "Premium selection of",
            ])} ${musicGenre.toLowerCase()} radio stations`,
            banner: `https://picsum.photos/seed/${faker.string.alphanumeric(
              10
            )}/1200/400`,
          },
          {
            name: `${
              adjective.charAt(0).toUpperCase() + adjective.slice(1)
            } ${faker.helpers.arrayElement([
              "Vibes",
              "Mix",
              "Playlist",
              "Collection",
            ])}`,
            desc: `${faker.helpers.arrayElement([
              "Perfect for",
              "Great for",
              "Ideal for",
            ])} ${faker.helpers.arrayElement([
              "relaxing",
              "working",
              "studying",
              "partying",
              "driving",
            ])}`,
            banner: `https://picsum.photos/seed/${faker.string.alphanumeric(
              10
            )}/1200/400`,
          },
          {
            name:
              faker.helpers.arrayElement([
                "Weekend",
                "Morning",
                "Evening",
                "Night",
                "Road Trip",
              ]) + " Radio",
            desc: faker.lorem.sentence(),
            banner: `https://picsum.photos/seed/${faker.string.alphanumeric(
              10
            )}/1200/400`,
          },
        ];

        const listInfo = listNames[listIndex]!;

        // Create favorites list
        const favoritesList = NDKWFFavorites.createDefault(
          ndk as any, // Type mismatch between NDK versions in dependencies
          listInfo.name,
          listInfo.desc
        );
        favoritesList.pubkey = pubkey;
        favoritesList.banner = listInfo.banner;

        // Add 5-8 random stations to this list
        const numStations = faker.number.int({ min: 5, max: 8 });
        const selectedStations = faker.helpers.arrayElements(
          stationAddresses,
          Math.min(numStations, stationAddresses.length)
        );

        for (const stationAddress of selectedStations) {
          favoritesList.addStation(stationAddress);
        }

        // Sign and publish
        ndk.signer = signer;
        await favoritesList.sign();
        const relays = await favoritesList.publish();

        favoritesCount++;
        console.log(
          `  ✓ Created "${listInfo.name}" with ${selectedStations.length} stations (published to ${relays.size} relays)`
        );

        // Small delay to ensure relay processing
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          `  ✗ Failed to create favorites list for user ${userIndex}:`,
          error
        );
      }
    }
  }

  console.log(`\n✅ Successfully seeded ${favoritesCount} favorites lists!`);
}

async function migrateStations() {
  console.log("🚀 Starting legacy station migration...\n");

  // Read and parse SQL dump
  const sqlPath = path.join(process.cwd(), "legacy-db", "latest.sql");
  const allStations = extractStationsFromSQL(sqlPath);

  // Load extended metadata
  const checkHistory = extractStationCheckHistory(sqlPath);
  const servers = extractStreamingServers(sqlPath);

  // Select random stations (first non-relay arg is count)
  const countArg = process.argv.find(
    (arg, i) => i > 1 && !arg.startsWith("--")
  );
  const count = countArg ? parseInt(countArg) : 10;
  const selectedStations = selectRandomStations(allStations, count);
  console.log(`📊 Selected ${selectedStations.length} unique stations\n`);

  // Connect to relay
  console.log(`🔌 Connecting to relay: ${RELAY_URL}`);
  await ndk.connect();
  console.log("✅ Connected!\n");

  // Create signer
  const signer = new NDKPrivateKeySigner(APP_PRIVATE_KEY!); // Safe: checked at startup
  await signer.blockUntilReady();

  // Migrate stations
  let successCount = 0;
  let failCount = 0;
  const publishedEvents: NDKEvent[] = [];

  for (let i = 0; i < selectedStations.length; i++) {
    const station = selectedStations[i];
    if (!station) continue;

    try {
      const duplicates = (station as any)._duplicates || [station];
      const streamCount = new Set(
        duplicates
          .map((d: LegacyStation) => d.UrlCache || d.Url)
          .filter(Boolean)
      ).size;

      const streamInfo = streamCount > 1 ? ` (${streamCount} streams)` : "";
      console.log(
        `[${i + 1}/${selectedStations.length}] Publishing: ${
          station.Name
        }${streamInfo}`
      );

      const event = await legacyToNostrEvent(
        station,
        signer,
        checkHistory,
        servers
      );
      await event.publish();

      successCount++;
      publishedEvents.push(event);
      console.log(`  ✅ Published (ID: ${event.id?.substring(0, 16)}...)`);
    } catch (error) {
      failCount++;
      console.error(`  ❌ Failed: ${error}`);
    }
  }

  console.log(`\n📊 Migration Complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);

  // Seed favorites lists with the migrated stations
  if (successCount > 0) {
    await seedFavoritesLists(publishedEvents);

    // Create featured lists signed by the app
    await seedFeaturedLists(publishedEvents);
  }

  process.exit(0);
}

/**
 * Seed featured lists (signed by app pubkey) for the landing page
 */
async function seedFeaturedLists(publishedEvents: NDKEvent[]) {
  console.log("\n🌟 Starting featured lists seeding (app-signed)...");
  let featuredCount = 0;

  const appSigner = new NDKPrivateKeySigner(APP_PRIVATE_KEY!);
  await appSigner.blockUntilReady();

  // Build station addresses from published events
  const stationAddresses = publishedEvents.map((event) => {
    const dTag = event.tagValue("d");
    return `31237:${event.pubkey}:${dTag}`;
  });

  const featuredListsConfig = [
    {
      name: "Staff Picks",
      desc: "Our favorite stations handpicked by the Wavefunc team",
      banner: "https://picsum.photos/seed/staff/1200/400",
    },
    {
      name: "New & Noteworthy",
      desc: "Recently added stations worth checking out",
      banner: "https://picsum.photos/seed/new/1200/400",
    },
  ] as const;

  for (const listConfig of featuredListsConfig) {
    try {
      // Create featured list
      const featuredList = NDKWFFavorites.createDefault(
        ndk as any,
        listConfig.name,
        listConfig.desc
      );
      featuredList.pubkey = APP_PUBKEY;
      featuredList.banner = listConfig.banner;

      // Add 6-8 random stations to featured list
      const numStations = faker.number.int({ min: 6, max: 8 });
      const selectedStations = faker.helpers.arrayElements(
        stationAddresses,
        Math.min(numStations, stationAddresses.length)
      );

      for (const stationAddress of selectedStations) {
        featuredList.addStation(stationAddress);
      }

      // Sign and publish
      ndk.signer = appSigner;
      await featuredList.sign();
      const relays = await featuredList.publish();

      featuredCount++;
      console.log(
        `  ✓ Created featured list "${listConfig.name}" with ${selectedStations.length} stations (published to ${relays.size} relays)`
      );

      // Small delay to ensure relay processing
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(
        `  ✗ Failed to create featured list "${listConfig.name}":`,
        error
      );
    }
  }

  console.log(`\n✅ Successfully seeded ${featuredCount} featured lists!`);
}

// Run migration
migrateStations().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
