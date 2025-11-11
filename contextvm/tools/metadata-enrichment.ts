import { searchRecordings } from "./musicbrainz.ts";
import type { RawMetadata, EnrichedMetadata } from "../schemas.ts";

/**
 * Enrich raw stream metadata using MusicBrainz
 *
 * Takes messy stream data like "Snow Tha Product - Anyone" and returns
 * clean, normalized artist, title, and album information.
 */
export async function enrichMetadata(
  raw: RawMetadata
): Promise<EnrichedMetadata> {
  // Try to extract artist and title from raw data
  let artist = raw.artist?.trim();
  let title = raw.title?.trim() || raw.song?.trim();

  // If we have StreamTitle in raw, use that as fallback
  if (!artist || !title) {
    const streamTitle = raw.raw?.StreamTitle as string | undefined;
    if (streamTitle) {
      const parsed = parseStreamTitle(streamTitle);
      artist = artist || parsed.artist;
      title = title || parsed.title;
    }
  }

  // If we still don't have both artist and title, return raw data
  if (!artist || !title) {
    return {
      artist: artist || "Unknown Artist",
      title: title || "Unknown Title",
      confidence: "none",
      source: "raw",
    };
  }

  try {
    // Search MusicBrainz with fuzzy matching
    console.log(`🔍 Enriching: ${artist} - ${title}`);

    const results = await searchRecordings(title, artist);

    if (results.length === 0 || !results[0]) {
      console.log(`⚠️ No MusicBrainz results found for: ${artist} - ${title}`);
      return {
        artist,
        title,
        confidence: "low",
        source: "raw",
      };
    }

    // Get best match (highest score)
    const bestMatch = results[0];

    // Determine confidence based on score
    // MusicBrainz scores are typically 0-100
    let confidence: "high" | "medium" | "low";
    if (bestMatch.score >= 90) {
      confidence = "high";
    } else if (bestMatch.score >= 70) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    console.log(
      `✅ Found match: ${bestMatch.artist} - ${bestMatch.title} (score: ${bestMatch.score}, confidence: ${confidence})`
    );

    return {
      artist: bestMatch.artist,
      title: bestMatch.title,
      album: bestMatch.release,
      releaseDate: bestMatch.releaseDate,
      duration: bestMatch.duration,
      mbid: bestMatch.id,
      confidence,
      source: "musicbrainz",
    };
  } catch (error: any) {
    console.error(`❌ MusicBrainz enrichment error: ${error.message}`);

    // Return raw data as fallback
    return {
      artist,
      title,
      confidence: "low",
      source: "raw",
    };
  }
}

/**
 * Parse common stream title formats:
 * - "Artist - Title"
 * - "Title by Artist"
 * - "Artist: Title"
 */
function parseStreamTitle(streamTitle: string): {
  artist?: string;
  title?: string;
} {
  const trimmed = streamTitle.trim();

  // Format: "Artist - Title"
  const dashMatch = trimmed.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch && dashMatch[1] && dashMatch[2]) {
    return {
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
    };
  }

  // Format: "Title by Artist"
  const byMatch = trimmed.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch && byMatch[1] && byMatch[2]) {
    return {
      title: byMatch[1].trim(),
      artist: byMatch[2].trim(),
    };
  }

  // Format: "Artist: Title"
  const colonMatch = trimmed.match(/^(.+?)\s*:\s*(.+)$/);
  if (colonMatch && colonMatch[1] && colonMatch[2]) {
    return {
      artist: colonMatch[1].trim(),
      title: colonMatch[2].trim(),
    };
  }

  // Fallback: treat as title only
  return {
    title: trimmed,
  };
}

/**
 * Batch enrich multiple metadata entries
 * Uses rate limiting to respect MusicBrainz API limits (1 request per second)
 */
export async function enrichMetadataBatch(
  items: RawMetadata[]
): Promise<EnrichedMetadata[]> {
  const results: EnrichedMetadata[] = [];

  for (const item of items) {
    const enriched = await enrichMetadata(item);
    results.push(enriched);

    // Rate limit: MusicBrainz requires 1 request per second
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}
