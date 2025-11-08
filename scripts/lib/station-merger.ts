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
    (s) =>
      s[fieldName] !== null && s[fieldName] !== undefined && s[fieldName] !== ""
  );

  if (withValue.length === 0) return null;
  if (withValue.length === 1) return withValue[0]?.[fieldName] as T;

  // Sort by lastchangetime (most recent first)
  const sorted = withValue.sort((a, b) => {
    const timeA = parseDateTime(a.LastChangeTimeISO8601, a.LastChangeTime);
    const timeB = parseDateTime(b.LastChangeTimeISO8601, b.LastChangeTime);
    return timeB - timeA; // Descending (newest first)
  });

  return sorted[0]?.[fieldName] as T;
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

  return scored[0]?.index || 0;
}

/**
 * Merge duplicate stations into one enriched station with multiple streams
 */
export function mergeStations(duplicates: LegacyStation[]): LegacyStation {
  if (duplicates.length === 1 && duplicates[0]) {
    return { ...duplicates[0], _duplicates: duplicates };
  }

  if (duplicates.length === 0 || !duplicates[0]) {
    // Fallback for empty array - shouldn't happen but needed for type safety
    return {
      StationID: 0,
      StationUuid: "",
      Name: "Unknown Station",
      Url: null,
      Homepage: null,
      Favicon: null,
      Country: null,
      Language: null,
      Tags: null,
      Votes: 0,
      Subcountry: null,
      Codec: null,
      Bitrate: 0,
      UrlCache: null,
      Hls: 0,
      CountryCode: null,
      GeoLat: null,
      GeoLong: null,
      LanguageCodes: null,
      ServerUuid: null,
      _duplicates: duplicates,
    };
  }

  // Collect all streams
  const streams = collectStreams(duplicates);
  const primaryStreamIndex = determinePrimaryStream(streams);

  // Build merged station
  const merged: LegacyStation = {
    // Use first station's ID and UUID as base
    StationID: duplicates[0]?.StationID || 0,
    StationUuid: duplicates[0]?.StationUuid || "",

    // Merge string fields (prefer most recent)
    Name: mergeField<string>(duplicates, "Name") || "Unknown Station",
    Url: mergeField<string>(duplicates, "Url"),
    Homepage: mergeField<string>(duplicates, "Homepage"),
    Favicon: mergeField<string>(duplicates, "Favicon"),
    Country: mergeField<string>(duplicates, "Country"),
    Subcountry: mergeField<string>(duplicates, "Subcountry"),
    CountryCode: mergeField<string>(duplicates, "CountryCode"),
    ServerUuid: mergeField<string>(duplicates, "ServerUuid"),

    // Merge list fields (combine all unique values)
    Language: mergeCommaSeparatedList(duplicates, "Language"),
    LanguageCodes: mergeCommaSeparatedList(duplicates, "LanguageCodes"),
    Tags: mergeCommaSeparatedList(duplicates, "Tags"),

    // Merge numeric fields (take maximum)
    Votes: mergeNumericMax(duplicates, "Votes"),
    Hls: mergeNumericMax(duplicates, "Hls"),

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

  if (!firstStation) {
    return {
      duplicateCount: original.length,
      streamCount: streams.length,
      enrichedFields: [],
    };
  }

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

/**
 * Advanced grouping: Group stations by normalized name first, then by URL patterns
 * This is the enhanced algorithm from the legacy implementation
 */
export function groupStationsByNameAndUrl(
  stations: LegacyStation[],
  normalizeNameFn: (name: string) => string,
  areRelatedUrlsFn: (url1: string, url2: string) => boolean
): Map<string, LegacyStation[]> {
  const groups = new Map<string, LegacyStation[]>();
  const processedStationIds = new Set<string>();

  // Step 1: Group by normalized name
  const nameGroups: Record<string, LegacyStation[]> = {};
  for (const station of stations) {
    const normalizedName = normalizeNameFn(station.Name || "");
    if (!nameGroups[normalizedName]) {
      nameGroups[normalizedName] = [];
    }
    nameGroups[normalizedName].push(station);
  }

  // Step 2: Within each name group, further group by URL patterns
  for (const [normalizedName, stationsWithSameName] of Object.entries(
    nameGroups
  )) {
    // Skip if only one station
    if (stationsWithSameName.length <= 1) {
      if (stationsWithSameName.length === 1) {
        const station = stationsWithSameName[0];
        if (station) {
          const key = `${normalizedName}|${station.StationUuid}`;
          groups.set(key, [station]);
          processedStationIds.add(station.StationUuid);
        }
      }
      continue;
    }

    // Get unprocessed stations in this name group
    const unprocessed = stationsWithSameName.filter(
      (s) => !processedStationIds.has(s.StationUuid)
    );

    // For each unprocessed station, try to form a group based on URL pattern
    for (let i = 0; i < unprocessed.length; i++) {
      const mainStation = unprocessed[i];

      if (!mainStation) continue;

      // Skip if already processed
      if (processedStationIds.has(mainStation.StationUuid)) continue;

      const groupKey = `${normalizedName}|${mainStation.StationUuid}`;
      const stationGroup: LegacyStation[] = [mainStation];
      processedStationIds.add(mainStation.StationUuid);

      const seenUrls = new Set<string>([mainStation.Url || ""]);

      // Find other stations with related URLs
      for (let j = i + 1; j < unprocessed.length; j++) {
        const candidateStation = unprocessed[j];

        if (!candidateStation) continue;

        // Skip if already processed or URL already seen
        if (
          processedStationIds.has(candidateStation.StationUuid) ||
          seenUrls.has(candidateStation.Url || "")
        ) {
          continue;
        }

        // Check if URLs are related
        const url1 = mainStation.Url || "";
        const url2 = candidateStation.Url || "";

        if (!url1 || !url2) continue;

        const urlsAreRelated = areRelatedUrlsFn(url1, url2);

        if (urlsAreRelated) {
          // Additional validation: country codes should match if both present
          if (
            mainStation.CountryCode &&
            candidateStation.CountryCode &&
            mainStation.CountryCode !== candidateStation.CountryCode
          ) {
            continue; // Different countries = different stations
          }

          // Add to group
          stationGroup.push(candidateStation);
          processedStationIds.add(candidateStation.StationUuid);
          seenUrls.add(url2);
        }
      }

      groups.set(groupKey, stationGroup);
    }
  }

  return groups;
}
