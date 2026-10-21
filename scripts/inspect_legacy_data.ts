// Script to inspect random stations from legacy database
import { readFileSync } from "fs";
import path from "path";

// Legacy DB Station structure (all 32 fields)
interface LegacyStation {
  StationID: number;
  Name: string | null;
  Url: string | null;
  Homepage: string | null;
  Favicon: string | null;
  Creation: string | null;
  Country: string | null;
  Language: string | null;
  Tags: string | null;
  Votes: number;
  Subcountry: string | null;
  clickcount: number;
  ClickTrend: number;
  ClickTimestamp: string | null;
  Codec: string | null;
  LastCheckOK: number;
  LastCheckTime: string | null;
  Bitrate: number;
  UrlCache: string | null;
  LastCheckOkTime: string | null;
  Hls: number;
  ChangeUuid: string | null;
  StationUuid: string;
  CountryCode: string | null;
  LastLocalCheckTime: string | null;
  CountrySubdivisionCode: string | null;
  GeoLat: number | null;
  GeoLong: number | null;
  SslError: number;
  LanguageCodes: string | null;
  ExtendedInfo: number;
  ServerUuid: string | null;
}

// Parse a single station INSERT line from SQL
function parseStationInsert(line: string): LegacyStation | null {
  const match = line.match(/\(([^)]+)\)/);
  if (!match?.[1]) return null;

  // Properly parse CSV-like values respecting quotes
  const values: (string | null)[] = [];
  let current = "";
  let inQuote = false;
  let escaped = false;

  for (const char of match[1]) {

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

  if (values.length < 32) {
    console.warn(`Skipping station - only ${values.length} fields found (expected 32)`);
    return null;
  }

  const station: LegacyStation = {
    StationID: parseInt(values[0] as string),
    Name: values[1] ?? null,
    Url: values[2] ?? null,
    Homepage: values[3] ?? null,
    Favicon: values[4] ?? null,
    Creation: values[5] ?? null,
    Country: values[6] ?? null,
    Language: values[7] ?? null,
    Tags: values[8] ?? null,
    Votes: parseInt(values[9] as string) || 0,
    Subcountry: values[10] ?? null,
    clickcount: parseInt(values[11] as string) || 0,
    ClickTrend: parseInt(values[12] as string) || 0,
    ClickTimestamp: values[13] ?? null,
    Codec: values[14] ?? null,
    LastCheckOK: parseInt(values[15] as string) || 0,
    LastCheckTime: values[16] ?? null,
    Bitrate: parseInt(values[17] as string) || 0,
    UrlCache: values[18] ?? null,
    LastCheckOkTime: values[19] ?? null,
    Hls: parseInt(values[20] as string) || 0,
    ChangeUuid: values[21] ?? null,
    StationUuid: values[22] || `legacy-${values[0]}`,
    CountryCode: values[23] ?? null,
    LastLocalCheckTime: values[24] ?? null,
    CountrySubdivisionCode: values[25] ?? null,
    GeoLat: values[26] ? parseFloat(values[26] as string) : null,
    GeoLong: values[27] ? parseFloat(values[27] as string) : null,
    SslError: parseInt(values[28] as string) || 0,
    LanguageCodes: values[29] ?? null,
    ExtendedInfo: parseInt(values[30] as string) || 0,
    ServerUuid: values[31] ?? null,
  };

  return station;
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

  console.log(`✅ Found ${stations.length} stations in database\n`);
  return stations;
}

// Pretty print a station with all fields
function printStation(station: LegacyStation, index: number) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`STATION ${index + 1}: ${station.Name}`);
  console.log("=".repeat(80));

  console.log(`\n📊 IDENTIFIERS:`);
  console.log(`   StationID:        ${station.StationID}`);
  console.log(`   StationUuid:      ${station.StationUuid}`);
  console.log(`   ChangeUuid:       ${station.ChangeUuid || "(null)"}`);
  console.log(`   ServerUuid:       ${station.ServerUuid || "(null)"}`);

  console.log(`\n📻 BASIC INFO:`);
  console.log(`   Name:             ${station.Name}`);
  console.log(`   Homepage:         ${station.Homepage || "(null)"}`);
  console.log(`   Favicon:          ${station.Favicon || "(null)"}`);
  console.log(`   Tags:             ${station.Tags || "(null)"}`);
  console.log(`   Creation:         ${station.Creation}`);

  console.log(`\n🌍 LOCATION:`);
  console.log(`   Country:          ${station.Country || "(null)"}`);
  console.log(`   CountryCode:      ${station.CountryCode || "(null)"}`);
  console.log(`   Subcountry:       ${station.Subcountry || "(null)"}`);
  console.log(`   SubdivisionCode:  ${station.CountrySubdivisionCode || "(null)"}`);
  console.log(`   GeoLat:           ${station.GeoLat !== null ? station.GeoLat : "(null)"}`);
  console.log(`   GeoLong:          ${station.GeoLong !== null ? station.GeoLong : "(null)"}`);

  console.log(`\n🗣️  LANGUAGE:`);
  console.log(`   Language:         ${station.Language || "(null)"}`);
  console.log(`   LanguageCodes:    ${station.LanguageCodes || "(null)"}`);

  console.log(`\n🎵 STREAM INFO:`);
  console.log(`   Url:              ${station.Url}`);
  console.log(`   UrlCache:         ${station.UrlCache}`);
  console.log(`   Codec:            ${station.Codec || "(null)"}`);
  console.log(`   Bitrate:          ${station.Bitrate} kbps`);
  console.log(`   Hls:              ${station.Hls ? "YES" : "NO"}`);
  console.log(`   SslError:         ${station.SslError ? "YES" : "NO"}`);

  console.log(`\n📈 STATISTICS:`);
  console.log(`   Votes:            ${station.Votes}`);
  console.log(`   ClickCount:       ${station.clickcount}`);
  console.log(`   ClickTrend:       ${station.ClickTrend}`);
  console.log(`   ClickTimestamp:   ${station.ClickTimestamp || "(null)"}`);

  console.log(`\n✅ HEALTH CHECKS:`);
  console.log(`   LastCheckOK:      ${station.LastCheckOK ? "YES" : "NO"}`);
  console.log(`   LastCheckTime:    ${station.LastCheckTime || "(null)"}`);
  console.log(`   LastCheckOkTime:  ${station.LastCheckOkTime || "(null)"}`);
  console.log(`   LastLocalCheck:   ${station.LastLocalCheckTime || "(null)"}`);

  console.log(`\n🔧 OTHER:`);
  console.log(`   ExtendedInfo:     ${station.ExtendedInfo}`);
}

// Main
async function main() {
  const sqlPath = path.join(process.cwd(), "legacy-db", "latest.sql");
  const allStations = extractStationsFromSQL(sqlPath);

  // Get count from command line (default 20)
  const count = process.argv[2] ? parseInt(process.argv[2]) : 20;

  // Select random stations
  const shuffled = [...allStations].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, Math.min(count, allStations.length));

  console.log(`Showing ${selected.length} random stations:\n`);

  selected.forEach((station, i) => printStation(station, i));

  console.log(`\n${"=".repeat(80)}`);
  console.log(`\nTotal stations in database: ${allStations.length}`);
  console.log(`Displayed: ${selected.length} random stations\n`);
}

main().catch(console.error);