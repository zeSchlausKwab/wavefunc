// migrate_legacy.ts - Convert legacy MariaDB station data to Nostr events
import { hexToBytes } from "@noble/hashes/utils";
import NDK, { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { getPublicKey } from "nostr-tools/pure";
import { readFileSync } from "fs";
import path from "path";

// App key for publishing stations
const APP_PRIVATE_KEY =
  "96c727f4d1ea18a80d03621520ebfe3c9be1387033009a4f5b65959d09222eec";
const APP_PUBKEY = getPublicKey(hexToBytes(APP_PRIVATE_KEY));

const ndk = new NDK({ explicitRelayUrls: ["ws://localhost:3334"] });

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
  Codec: string | null;
  Bitrate: number;
  UrlCache: string | null;
  CountryCode: string | null;
  GeoLat: number | null;
  GeoLong: number | null;
  LanguageCodes: string | null;
  StationUuid: string;
}

// Parse a single station INSERT line from SQL
function parseStationInsert(line: string): LegacyStation | null {
  // Extract values from INSERT statement
  // Format: (1,'Name','url',...),
  const match = line.match(/\(([^)]+)\)/);
  if (!match) return null;

  const values = match[1].split(",").map((v) => {
    v = v.trim();
    // Handle NULL
    if (v === "NULL") return null;
    // Remove quotes
    if (v.startsWith("'") && v.endsWith("'")) {
      return v.slice(1, -1).replace(/\\'/g, "'");
    }
    return v;
  });

  if (values.length < 25) return null;

  return {
    StationID: parseInt(values[0] as string),
    Name: values[1],
    Url: values[2],
    Homepage: values[3],
    Favicon: values[4],
    Country: values[6],
    Language: values[7],
    Tags: values[8],
    Votes: parseInt(values[9] as string) || 0,
    Codec: values[14],
    Bitrate: parseInt(values[17] as string) || 0,
    UrlCache: values[18],
    CountryCode: values[23],
    GeoLat: values[26] ? parseFloat(values[26] as string) : null,
    GeoLong: values[27] ? parseFloat(values[27] as string) : null,
    LanguageCodes: values[29],
    StationUuid: values[22] || `legacy-${values[0]}`,
  };
}

// Convert legacy station to Nostr event
async function legacyToNostrEvent(
  station: LegacyStation,
  signer: NDKPrivateKeySigner
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
      format: getFormat(dup.Codec),
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

  // Build content JSON
  const content = {
    description:
      station.Tags || `${station.Name} - ${station.Country || "Unknown"}`,
    streams,
  };

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

  if (station.Country) {
    tags.push(["location", station.Country]);
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

// Get MIME format from codec
function getFormat(codec: string | null): string {
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

// Group duplicate stations by name + country
function groupDuplicateStations(
  stations: LegacyStation[]
): Map<string, LegacyStation[]> {
  const groups = new Map<string, LegacyStation[]>();

  for (const station of stations) {
    // Create a key from normalized name + country
    const name = (station.Name || "").trim().toLowerCase();
    const country = (station.CountryCode || station.Country || "")
      .trim()
      .toLowerCase();
    const key = `${name}|${country}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(station);
  }

  return groups;
}

// Merge duplicate stations into one with multiple streams
function mergeDuplicateStations(duplicates: LegacyStation[]): LegacyStation {
  // Use the first station as the base
  const base = duplicates[0];

  // Store all unique streams
  const streams = new Set<string>();
  duplicates.forEach((dup) => {
    const url = dup.UrlCache || dup.Url;
    if (url) streams.add(url);
  });

  // Return base station (we'll handle multiple streams in the conversion)
  return {
    ...base,
    // Store all duplicates for later processing
    _duplicates: duplicates,
  } as any;
}

// Randomly select N stations (after deduplication)
function selectRandomStations(
  stations: LegacyStation[],
  count: number
): LegacyStation[] {
  console.log("🔍 Deduplicating stations...");

  // Group duplicates
  const groups = groupDuplicateStations(stations);
  console.log(
    `   Found ${groups.size} unique stations (from ${stations.length} total)`
  );

  // Merge duplicates
  const uniqueStations: LegacyStation[] = [];
  for (const [key, duplicates] of groups.entries()) {
    if (duplicates.length > 1) {
      console.log(
        `   📎 Merging ${duplicates.length} versions of "${duplicates[0].Name}"`
      );
    }
    uniqueStations.push(mergeDuplicateStations(duplicates));
  }

  // Randomly select
  const shuffled = [...uniqueStations].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, uniqueStations.length));
}

async function migrateStations() {
  console.log("🚀 Starting legacy station migration...\n");

  // Read and parse SQL dump
  const sqlPath = path.join(process.cwd(), "legacy-db", "latest.sql");
  const allStations = extractStationsFromSQL(sqlPath);

  // Select random stations
  const count = process.argv[2] ? parseInt(process.argv[2]) : 500;
  const selectedStations = selectRandomStations(allStations, count);
  console.log(`📊 Selected ${selectedStations.length} unique stations\n`);

  // Connect to relay
  console.log("🔌 Connecting to relay...");
  await ndk.connect();
  console.log("✅ Connected!\n");

  // Create signer
  const signer = new NDKPrivateKeySigner(APP_PRIVATE_KEY);
  await signer.blockUntilReady();

  // Migrate stations
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedStations.length; i++) {
    const station = selectedStations[i];
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

      const event = await legacyToNostrEvent(station, signer);
      await event.publish();

      successCount++;
      console.log(`  ✅ Published (ID: ${event.id?.substring(0, 16)}...)`);
    } catch (error) {
      failCount++;
      console.error(`  ❌ Failed: ${error}`);
    }
  }

  console.log(`\n📊 Migration Complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);

  process.exit(0);
}

// Run migration
migrateStations().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
