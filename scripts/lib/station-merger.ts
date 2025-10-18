// Station merging logic with data enrichment

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
  LastChangeTime?: string | null;
  LastChangeTimeISO8601?: string | null;
  [key: string]: any;
}

interface StreamInfo {
  url: string;
  codec: string | null;
  bitrate: number;
  source: LegacyStation; // Keep reference to original station
}

/**
 * Parse ISO 8601 or SQL datetime to timestamp for comparison
 */
function parseDateTime(
  isoTime: string | null | undefined,
  sqlTime: string | null | undefined
): number {
  if (isoTime) {
    const date = new Date(isoTime);
    if (!isNaN(date.getTime())) return date.getTime();
  }
  if (sqlTime) {
    const date = new Date(sqlTime);
    if (!isNaN(date.getTime())) return date.getTime();
  }
  return 0; // Unknown/invalid date = oldest
}

/**
 * Merge a field from multiple stations, preferring most recent non-null value
 */
function mergeField<T>(
  duplicates: LegacyStation[],
  fieldName: keyof LegacyStation
): T | null {
  // Filter stations that have non-null value for this field
  const withValue = duplicates.filter(
    (s) => s[fieldName] !== null && s[fieldName] !== undefined && s[fieldName] !== ""
  );

  if (withValue.length === 0) return null;
  if (withValue.length === 1) return withValue[0][fieldName] as T;

  // Sort by lastchangetime (most recent first)
  const sorted = withValue.sort((a, b) => {
    const timeA = parseDateTime(
      a.LastChangeTimeISO8601,
      a.LastChangeTime
    );
    const timeB = parseDateTime(
      b.LastChangeTimeISO8601,
      b.LastChangeTime
    );
    return timeB - timeA; // Descending (newest first)
  });

  return sorted[0][fieldName] as T;
}

/**
 * Merge numeric field by taking maximum value (useful for Votes, etc.)
 */
function mergeNumericMax(
  duplicates: LegacyStation[],
  fieldName: keyof LegacyStation
): number {
  const values = duplicates
    .map((s) => s[fieldName])
    .filter((v) => typeof v === "number" && !isNaN(v)) as number[];

  return values.length > 0 ? Math.max(...values) : 0;
}

/**
 * Merge comma-separated list fields (Tags, Language, LanguageCodes)
 * Combines all unique values from all duplicates
 */
function mergeCommaSeparatedList(
  duplicates: LegacyStation[],
  fieldName: keyof LegacyStation
): string | null {
  const allValues = new Set<string>();

  for (const station of duplicates) {
    const value = station[fieldName];
    if (value && typeof value === "string") {
      const items = value.split(",").map((item) => item.trim().toLowerCase());
      items.forEach((item) => {
        if (item) allValues.add(item);
      });
    }
  }

  return allValues.size > 0 ? Array.from(allValues).join(",") : null;
}

/**
 * Collect all unique streams from duplicates with their quality info
 */
function collectStreams(duplicates: LegacyStation[]): StreamInfo[] {
  const streamMap = new Map<string, StreamInfo>();

  for (const station of duplicates) {
    const url = station.UrlCache || station.Url;
    if (!url) continue;

    // Use URL as key, keep highest bitrate version if duplicate URLs exist
    if (!streamMap.has(url)) {
      streamMap.set(url, {
        url,
        codec: station.Codec,
        bitrate: station.Bitrate || 0,
        source: station,
      });
    } else {
      // If same URL appears multiple times, keep the one with higher bitrate
      const existing = streamMap.get(url)!;
      if ((station.Bitrate || 0) > existing.bitrate) {
        streamMap.set(url, {
          url,
          codec: station.Codec,
          bitrate: station.Bitrate || 0,
          source: station,
        });
      }
    }
  }

  return Array.from(streamMap.values());
}

/**
 * Determine primary stream (highest quality)
 * Priority: AAC > MP3 > others, then highest bitrate
 */
function determinePrimaryStream(streams: StreamInfo[]): number {
  if (streams.length === 0) return 0;
  if (streams.length === 1) return 0;

  // Score each stream
  const scored = streams.map((stream, index) => {
    let score = stream.bitrate;

    // Codec bonus
    const codec = (stream.codec || "").toLowerCase();
    if (codec.includes("aac")) score += 1000;
    else if (codec.includes("mp3")) score += 500;

    return { index, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored[0].index;
}

/**
 * Merge duplicate stations into one enriched station with multiple streams
 */
export function mergeStations(duplicates: LegacyStation[]): LegacyStation {
  if (duplicates.length === 1) {
    return { ...duplicates[0], _duplicates: duplicates };
  }

  // Collect all streams
  const streams = collectStreams(duplicates);
  const primaryStreamIndex = determinePrimaryStream(streams);

  // Build merged station
  const merged: LegacyStation = {
    // Use first station's ID and UUID as base
    StationID: duplicates[0].StationID,
    StationUuid: duplicates[0].StationUuid,

    // Merge string fields (prefer most recent)
    Name: mergeField<string>(duplicates, "Name") || "Unknown Station",
    Url: mergeField<string>(duplicates, "Url"),
    Homepage: mergeField<string>(duplicates, "Homepage"),
    Favicon: mergeField<string>(duplicates, "Favicon"),
    Country: mergeField<string>(duplicates, "Country"),
    CountryCode: mergeField<string>(duplicates, "CountryCode"),

    // Merge list fields (combine all unique values)
    Language: mergeCommaSeparatedList(duplicates, "Language"),
    LanguageCodes: mergeCommaSeparatedList(duplicates, "LanguageCodes"),
    Tags: mergeCommaSeparatedList(duplicates, "Tags"),

    // Merge numeric fields (take maximum)
    Votes: mergeNumericMax(duplicates, "Votes"),

    // Use primary stream's codec and bitrate
    Codec: streams[primaryStreamIndex]?.codec || null,
    Bitrate: streams[primaryStreamIndex]?.bitrate || 0,
    UrlCache: streams[primaryStreamIndex]?.url || null,

    // Merge geo coordinates (prefer most recent)
    GeoLat: mergeField<number>(duplicates, "GeoLat"),
    GeoLong: mergeField<number>(duplicates, "GeoLong"),

    // Store all duplicates for stream generation
    _duplicates: duplicates,
    _streams: streams,
    _primaryStreamIndex: primaryStreamIndex,
  };

  return merged;
}

/**
 * Get statistics about the merge operation
 */
export function getMergeStats(
  original: LegacyStation[],
  merged: LegacyStation
): {
  duplicateCount: number;
  streamCount: number;
  enrichedFields: string[];
} {
  const streams = (merged._streams as StreamInfo[]) || [];

  // Find which fields were enriched from duplicates
  const enrichedFields: string[] = [];
  const firstStation = original[0];

  const fieldsToCheck: (keyof LegacyStation)[] = [
    "Homepage",
    "Favicon",
    "Tags",
    "Language",
    "LanguageCodes",
    "GeoLat",
    "GeoLong",
  ];

  for (const field of fieldsToCheck) {
    const firstValue = firstStation[field];
    const mergedValue = merged[field];

    // Field was enriched if first station didn't have it but merged does
    if ((!firstValue || firstValue === "") && mergedValue) {
      enrichedFields.push(field as string);
    }
  }

  return {
    duplicateCount: original.length,
    streamCount: streams.length,
    enrichedFields,
  };
}