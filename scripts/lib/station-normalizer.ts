// Station name normalization and grouping utilities

interface LegacyStation {
  Name: string | null;
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
  return name
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
    .trim();
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