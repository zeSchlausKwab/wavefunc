// Station name normalization and grouping utilities

interface LegacyStation {
  Name: string | null;
  Url: string | null;
  CountryCode: string | null;
  Homepage: string | null;
  [key: string]: any;
}

/**
 * Normalize station name by removing format/bitrate suffixes
 * Examples:
 *   "SomaFM Drone Zone - (128 mp3)" → "somafm drone zone"
 *   "Radio X [MP3]" → "radio x"
 *   "Radio X 128kbps AAC+" → "radio x"
 *   "Radio X - High Quality" → "radio x - high quality"
 */
export function normalizeStationName(name: string): string {
  return (
    name
      .toLowerCase()
      // Remove trailing format indicators with parentheses: " - (128 mp3)", "(AAC)", etc.
      .replace(/\s*[-–]\s*\([^)]*\)\s*$/g, "")
      .replace(/\s*\([^)]*\)\s*$/g, "")
      // Remove trailing format indicators with brackets: " [MP3]", "[128k]", etc.
      .replace(/\s*\[[^\]]*\]\s*$/g, "")
      // Remove inline bitrate/format specs: "128kbps", "320k", "AAC+", etc.
      .replace(/\s+\d+k(bps|b)?\s*(mp3|aac|ogg|flac)?\+?\s*$/gi, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Normalize station name for grouping (removes all spaces and special chars)
 */
export function normalizeStationNameForGrouping(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "") // Remove all spaces
    .replace(/[^a-z0-9]/gi, ""); // Remove non-alphanumeric chars
}

/**
 * Create a grouping key for deduplication
 * Stations with the same key will be merged
 * Key format: "{normalized_name}|{country_code}|{homepage}"
 */
export function createGroupingKey(station: LegacyStation): string {
  const name = normalizeStationName(station.Name || "");
  const countryCode = (station.CountryCode || "").trim().toLowerCase();
  const homepage = (station.Homepage || "").trim().toLowerCase();

  return `${name}|${countryCode}|${homepage}`;
}

/**
 * Extract the normalized/clean name from a station
 * This is what we'll use as the final station name after merging
 */
export function getCleanStationName(station: LegacyStation): string {
  const name = station.Name || "Unknown Station";
  const normalized = normalizeStationName(name);

  // Capitalize first letter of each word for presentation
  return normalized
    .split(" ")
    .map((word) => {
      // Keep acronyms uppercase (2-3 letter words in original that were uppercase)
      const originalWord = name
        .split(" ")
        .find((w) => w.toLowerCase() === word.toLowerCase());
      if (
        originalWord &&
        originalWord.length <= 3 &&
        originalWord === originalWord.toUpperCase()
      ) {
        return originalWord;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Extract the base URL pattern from a URL (domain + path structure)
 * This helps identify streams from the same broadcaster
 */
export function extractUrlPattern(url: string): string {
  try {
    // Handle URLs without protocol
    let urlStr = url;
    if (!urlStr.includes("://")) {
      urlStr = "http://" + urlStr;
    }

    const urlObj = new URL(urlStr);
    const domain = urlObj.hostname;
    // Include port in the pattern since different ports often indicate different stations
    const port = urlObj.port ? `:${urlObj.port}` : "";

    // Extract path components and remove empty segments
    const pathParts = urlObj.pathname.split("/").filter(Boolean);

    // If path contains at least one segment
    if (pathParts.length >= 1) {
      // 1. For URLs with specific streaming path patterns
      if (
        pathParts.length >= 2 &&
        pathParts[0] &&
        pathParts[1] &&
        (pathParts[0].toLowerCase() === "live" ||
          pathParts[0].toLowerCase() === "stream" ||
          pathParts[0].toLowerCase() === "streams" ||
          pathParts[0].toLowerCase() === "radio" ||
          pathParts[0].toLowerCase() === "audio")
      ) {
        // Include the domain, port and the first two path segments
        return `${domain}${port}/${pathParts[0]}/${pathParts[1]}`;
      }

      // 2. For URLs with file-like endings (handle cases where ID is in the filename)
      const lastSegment = pathParts[pathParts.length - 1];
      if (lastSegment && lastSegment.includes(".")) {
        // Get the base name without extension
        const baseName = lastSegment.split(".")[0];
        // Include the domain, port and all path except the extension
        return `${domain}${port}${
          pathParts.length > 1 ? "/" + pathParts.slice(0, -1).join("/") : ""
        }/${baseName}`;
      }

      // 3. Handle URLs where each different path represents a different station
      // Include the full path except file extensions
      return `${domain}${port}/${pathParts.join("/")}`.replace(
        /\.(mp3|aac|ogg|m4a|flac|wav|pls|m3u|m3u8|xspf)$/i,
        ""
      );
    }

    // Default case: domain + port
    return domain + port;
  } catch (e) {
    return url;
  }
}

/**
 * Check if two stations are likely from the same broadcaster based on URL patterns
 * This helps identify quality variations of the same station
 */
export function areRelatedUrls(url1: string, url2: string): boolean {
  try {
    // First clean both URLs to handle protocol inconsistencies
    let urlStr1 = url1;
    let urlStr2 = url2;
    if (!urlStr1.includes("://")) urlStr1 = "http://" + urlStr1;
    if (!urlStr2.includes("://")) urlStr2 = "http://" + urlStr2;

    const url1Obj = new URL(urlStr1);
    const url2Obj = new URL(urlStr2);

    // Different domains means probably different stations
    if (url1Obj.hostname !== url2Obj.hostname) {
      // Check for subdomains of the same root domain
      const rootDomain1 = url1Obj.hostname.split(".").slice(-2).join(".");
      const rootDomain2 = url2Obj.hostname.split(".").slice(-2).join(".");

      // Only consider same root domain if we have EXACTLY matching paths
      if (rootDomain1 === rootDomain2) {
        return url1Obj.pathname === url2Obj.pathname;
      }

      return false;
    }

    // Different ports typically indicate different stations/services
    if (
      url1Obj.port !== url2Obj.port &&
      url1Obj.port !== "" &&
      url2Obj.port !== ""
    ) {
      // Check for specific ports used for quality variations (e.g., 8000 vs 8010 for different bitrates)
      const qualityPortPatterns = [
        /^80\d{2}$/, // 8000, 8001, 8010, etc.
        /^443\d{1}$/, // 4430, 4431, etc.
      ];

      const isQualityPortDiff = qualityPortPatterns.some((pattern) => {
        // If both ports match the same quality port pattern, they might be related
        if (pattern.test(url1Obj.port) && pattern.test(url2Obj.port)) {
          // Also check if paths are identical - this is important
          return url1Obj.pathname === url2Obj.pathname;
        }
        return false;
      });

      // If not a quality port difference, treat as different stations
      if (!isQualityPortDiff) {
        return false;
      }
    }

    // Extract path parts for more detailed comparison
    const path1 = url1Obj.pathname;
    const path2 = url2Obj.pathname;

    // If paths are identical (ignoring query params), they're the same station
    if (path1 === path2) return true;

    // Clean paths (remove extensions)
    const cleanPath1 = path1.replace(
      /\.(mp3|aac|ogg|m4a|flac|wav|pls|m3u|m3u8|xspf)$/i,
      ""
    );
    const cleanPath2 = path2.replace(
      /\.(mp3|aac|ogg|m4a|flac|wav|pls|m3u|m3u8|xspf)$/i,
      ""
    );

    // If clean paths are identical, they might be the same station with different formats
    if (cleanPath1 === cleanPath2) return true;

    // Extract path segments and analyze them
    const segments1 = cleanPath1.split("/").filter(Boolean);
    const segments2 = cleanPath2.split("/").filter(Boolean);

    // Different segment count likely means different resources
    if (segments1.length !== segments2.length) return false;

    // Quality and format indicators often found in URLs
    const qualityPatterns = [
      /\b(low|high|medium)\b/i,
      /\b(hq|lq|hi|lo)\b/i,
      /\b(\d{2,3}k)\b/i, // 64k, 128k, 320k etc.
      /\b(\d+)(kbps|k)\b/i, // 64kbps, 128kbps, etc.
      /\b(mobile|desktop|web)\b/i,
      /_(low|high|medium)\b/i,
      /_(64|128|192|320)/i, // Patterns like _64, _128
    ];

    // Count differences in path segments
    let differingSegments = 0;
    let qualityDifferences = 0;
    let differentIdentifiers = false;

    for (let i = 0; i < segments1.length; i++) {
      const seg1 = segments1[i];
      const seg2 = segments2[i];

      if (!seg1 || !seg2) continue;

      if (seg1 !== seg2) {
        differingSegments++;

        // Check if this segment looks like a unique identifier
        const isLikelyId =
          // Longer alphanumeric strings likely represent unique IDs
          (seg1.length > 8 && /^[a-z0-9]+$/i.test(seg1)) ||
          (seg2.length > 8 && /^[a-z0-9]+$/i.test(seg2)) ||
          // If segments differ in the first position after a known streaming path
          (i === 1 &&
            segments1[0] &&
            (segments1[0].toLowerCase() === "radio" ||
              segments1[0].toLowerCase() === "stream" ||
              segments1[0].toLowerCase() === "audio"));

        if (isLikelyId) {
          differentIdentifiers = true;
          break;
        }

        // Check if difference looks like a quality indicator
        const isQualityDiff = qualityPatterns.some(
          (pattern) => pattern.test(seg1) || pattern.test(seg2)
        );

        if (isQualityDiff) qualityDifferences++;
      }
    }

    // If we found different identifiers, they're different stations
    if (differentIdentifiers) return false;

    // If the only differences are quality indicators, consider them related
    return differingSegments > 0 && differingSegments === qualityDifferences;
  } catch (e) {
    return false;
  }
}
