// Stream Metadata Extraction Tool
// Extracts "now playing" info from Icecast/Shoutcast streams

import { parseIcyResponse } from "@music-metadata/icy";
import { probeStream } from "./probe.ts";
import { enrichMetadata } from "./metadata-enrichment.ts";
import type { StreamMetadata } from "../schemas.ts";

/**
 * Extract metadata from Icecast/Shoutcast stream
 * Tries multiple strategies to get the best metadata
 */
export async function extractIcecastMetadata(
  url: string,
  options?: { enrichWithMusicBrainz?: boolean }
): Promise<StreamMetadata> {
  try {
    let metadata: StreamMetadata | null = null;

    // Strategy 0: Try the new probe stream function first
    const probeResult = await tryProbeStream(url);
    if (probeResult && (probeResult.title || probeResult.station)) {
      console.log(`✅ Extracted metadata via probe stream`);
      metadata = probeResult;
    }

    // Strategy 1: Try common Icecast JSON endpoints
    if (!metadata) {
      const jsonMetadata = await tryIcecastJsonEndpoints(url);
      if (jsonMetadata && (jsonMetadata.title || jsonMetadata.station)) {
        console.log(`✅ Extracted metadata via JSON endpoint`);
        metadata = jsonMetadata;
      }
    }

    // Strategy 2: Try stream headers with HEAD request
    if (!metadata) {
      const headerMetadata = await tryStreamHeaders(url);
      if (headerMetadata && (headerMetadata.title || headerMetadata.station)) {
        console.log(`✅ Extracted metadata via stream headers`);
        metadata = headerMetadata;
      }
    }

    // Strategy 3: Try reading from stream data
    if (!metadata) {
      const streamMetadata = await tryStreamData(url);
      if (streamMetadata && (streamMetadata.title || streamMetadata.station)) {
        console.log(`✅ Extracted metadata via stream data`);
        metadata = streamMetadata;
      }
    }

    // No metadata found
    if (!metadata) {
      console.warn(`⚠️ No metadata available for ${url}`);
      return {
        url,
        source: "UNKNOWN",
        station: "Unknown",
        title: "No metadata available",
        method: "none",
      };
    }

    // Enrich with MusicBrainz if requested and we have artist/title data
    if (options?.enrichWithMusicBrainz !== false && (metadata.artist || metadata.song || metadata.title)) {
      try {
        console.log(`🎵 Enriching metadata with MusicBrainz...`);
        const enriched = await enrichMetadata({
          artist: metadata.artist,
          title: metadata.song || metadata.title,
          raw: metadata.raw,
        });
        metadata.enriched = enriched;
        console.log(`✅ Enrichment complete: ${enriched.artist} - ${enriched.title} (confidence: ${enriched.confidence})`);
      } catch (error: any) {
        console.warn(`⚠️ MusicBrainz enrichment failed: ${error.message}`);
        // Continue without enrichment
      }
    }

    return metadata;
  } catch (error: any) {
    console.error(`❌ Stream metadata extraction error: ${error.message}`);
    throw new Error(`Failed to extract metadata: ${error.message}`);
  }
}

/**
 * Strategy 0: Try the new probe stream function
 * This handles ICY, HLS-ID3, and playlist resolution
 */
async function tryProbeStream(url: string): Promise<StreamMetadata | null> {
  try {
    const result = await probeStream(url);
    
    // Convert NowPlaying to StreamMetadata format
    const metadata: StreamMetadata = {
      url: result.url,
      source: result.source,
      method: `probe:${result.source}`,
    };

    if (result.station) metadata.station = result.station;
    if (result.artist) metadata.artist = result.artist;
    if (result.title) {
      metadata.title = result.title;
      metadata.song = result.title; // Also set as song for compatibility
    }
    if (result.raw) metadata.raw = result.raw;
    if (result.notes) metadata.notes = result.notes;

    // If we have artist and title, combine them for the title field
    if (result.artist && result.title) {
      metadata.title = `${result.artist} - ${result.title}`;
    }

    return metadata;
  } catch (error: any) {
    console.warn(`⚠️ Probe stream failed: ${error.message}`);
    return null;
  }
}

/**
 * Strategy 1: Try common Icecast JSON endpoints
 * These endpoints provide rich metadata without parsing the stream
 */
async function tryIcecastJsonEndpoints(
  streamUrl: string
): Promise<StreamMetadata | null> {
  try {
    const url = new URL(streamUrl);
    const baseUrl = `${url.protocol}//${url.host}`;
    const mountpoint = url.pathname;

    // Common Icecast JSON endpoints to try
    const endpoints = [
      `${baseUrl}/status-json.xsl`,
      `${baseUrl}/stats`,
      `${baseUrl}/status.xsl?mount=${mountpoint}`,
      `${baseUrl}/json.xsl`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "WaveFunc/1.0",
          },
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (!response.ok) continue;

        const data = await response.json();
        const metadata = parseIcecastJson(data, mountpoint);

        if (metadata) {
          metadata.url = streamUrl;
          metadata.source = "JSON";
          metadata.method = `json:${endpoint}`;
          return metadata;
        }
      } catch (e) {
        // Try next endpoint
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse Icecast JSON response to extract metadata
 */
function parseIcecastJson(
  data: any,
  mountpoint: string
): StreamMetadata | null {
  try {
    // Icecast 2.4+ format
    if (data.icestats?.source) {
      const sources = Array.isArray(data.icestats.source)
        ? data.icestats.source
        : [data.icestats.source];

      // Find matching mountpoint or use first source
      const source =
        sources.find((s: any) => s.listenurl?.includes(mountpoint)) ||
        sources[0];

      if (source) {
        const metadata: StreamMetadata = {};

        if (source.title) {
          metadata.title = source.title;
          parseTitle(source.title, metadata);
        }
        if (source.server_name) metadata.station = source.server_name;
        if (source.server_description) metadata.description = source.server_description;
        if (source.genre) metadata.genre = source.genre;
        if (source.bitrate) metadata.bitrate = source.bitrate.toString();
        if (source.listeners) metadata.listeners = parseInt(source.listeners);

        return metadata;
      }
    }

    // SHOUTcast DNAS format
    if (data.songtitle || data.servertitle) {
      const metadata: StreamMetadata = {};

      if (data.songtitle) {
        metadata.title = data.songtitle;
        parseTitle(data.songtitle, metadata);
      }
      if (data.servertitle) metadata.station = data.servertitle;
      if (data.servergenre) metadata.genre = data.servergenre;
      if (data.bitrate) metadata.bitrate = data.bitrate.toString();
      if (data.currentlisteners) metadata.listeners = parseInt(data.currentlisteners);

      return metadata;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Strategy 2: Try extracting from stream headers
 */
async function tryStreamHeaders(url: string): Promise<StreamMetadata | null> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "WaveFunc/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });

    console.log(`📋 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.warn(`⚠️ Non-OK response: ${response.status}`);
      return null;
    }

    console.log(`📋 Response: ${JSON.stringify(response)}`);

    const metadata: StreamMetadata = {};
    const headers = response.headers;

    // Station name
    const stationName =
      headers.get("icy-name") ||
      headers.get("ice-name") ||
      headers.get("x-audiocast-name");
    if (stationName) metadata.station = stationName;

    // Genre
    const genre =
      headers.get("icy-genre") ||
      headers.get("ice-genre") ||
      headers.get("x-audiocast-genre");
    if (genre) metadata.genre = genre;

    // Description
    const description =
      headers.get("icy-description") ||
      headers.get("ice-description") ||
      headers.get("x-audiocast-description");
    if (description) metadata.description = description;

    // Bitrate
    const bitrate = headers.get("icy-br") || headers.get("ice-audio-info");
    if (bitrate) metadata.bitrate = bitrate;

    // Current song (if available in headers)
    const currentSong = headers.get("icy-title") || headers.get("ice-title");
    if (currentSong) {
      metadata.title = currentSong;
      parseTitle(currentSong, metadata);
    }

    if (Object.keys(metadata).length > 0) {
      metadata.url = url;
      metadata.source = "HEADERS";
      metadata.method = "headers";
      return metadata;
    }

    return null;
  } catch (error: any) {
    console.error(`⚠️ Header extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Strategy 3: Try extracting from stream data
 */
async function tryStreamData(url: string): Promise<StreamMetadata | null> {
  try {
    // First get headers to check for icy-metaint
    const headResponse = await fetch(url, {
      method: "HEAD",
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "WaveFunc/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });

    const metaintStr = headResponse.headers.get("icy-metaint");
    if (!metaintStr) {
      return null;
    }

    const metadata = await extractFromStreamData(url, headResponse.headers);
    if (metadata && (metadata.title || metadata.station)) {
      metadata.url = url;
      metadata.source = "STREAM";
      metadata.method = "stream-data";
      return metadata;
    }

    return null;
  } catch (error: any) {
    console.error(`⚠️ Stream data extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Parse artist - title from metadata string
 */
function parseTitle(title: string, metadata: StreamMetadata): void {
  // Common formats: "Artist - Title" or "Title by Artist"
  const dashSplit = title.split(" - ");
  if (dashSplit.length === 2 && dashSplit[0] && dashSplit[1]) {
    metadata.artist = dashSplit[0].trim();
    metadata.song = dashSplit[1].trim();
    return;
  }

  const bySplit = title.split(" by ");
  if (bySplit.length === 2 && bySplit[0] && bySplit[1]) {
    metadata.song = bySplit[0].trim();
    metadata.artist = bySplit[1].trim();
    return;
  }

  // Fallback: just use as song title
  metadata.song = title;
}

/**
 * Extract metadata by reading stream data using music-metadata-icy
 * This uses a robust library for parsing ICY metadata
 */
async function extractFromStreamData(
  url: string,
  headers: Headers
): Promise<StreamMetadata> {
  // Check if server supports metadata
  const metaintStr = headers.get("icy-metaint");
  if (!metaintStr) {
    return { station: "Unknown", title: "No metadata available" };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "WaveFunc/1.0",
      },
    });

    if (!response.body) {
      throw new Error("No response body");
    }

    const metadata: StreamMetadata = {};

    // Use music-metadata-icy to parse the stream
    return new Promise<StreamMetadata>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for ICY metadata"));
      }, 10000); // 10 second timeout

      let resolved = false;

      try {
        // Parse ICY response and extract metadata
        const cleanStream = parseIcyResponse(response, ({ metadata: icyMeta, stats }) => {
          if (resolved) return;

          console.log(`📻 ICY metadata received:`, icyMeta);
          console.log(`📊 Stats:`, stats);

          // Extract station info from headers
          if (icyMeta.icyName) metadata.station = icyMeta.icyName;
          if (icyMeta.icyGenre) metadata.genre = icyMeta.icyGenre;
          if (icyMeta.bitrate) metadata.bitrate = icyMeta.bitrate;
          if (icyMeta.contentType) metadata.raw = { ...metadata.raw, contentType: icyMeta.contentType };

          // Extract current song
          if (icyMeta.StreamTitle) {
            metadata.title = icyMeta.StreamTitle;
            parseTitle(icyMeta.StreamTitle, metadata);
          }

          // We got metadata, resolve immediately
          if (icyMeta.StreamTitle || icyMeta.icyName) {
            resolved = true;
            clearTimeout(timeout);

            // Cancel the stream reading
            cleanStream.cancel().catch(() => {});

            resolve(metadata);
          }
        });

        // Start consuming the stream to trigger metadata callbacks
        const reader = cleanStream.getReader();

        const consumeStream = async () => {
          try {
            while (!resolved) {
              const { done } = await reader.read();
              if (done) break;
              // Just consume the stream, we don't need the audio data
            }

            // If we exit the loop without resolving, we didn't get metadata
            if (!resolved) {
              clearTimeout(timeout);
              resolve(metadata);
            }
          } catch (error) {
            if (!resolved) {
              clearTimeout(timeout);
              reject(error);
            }
          }
        };

        consumeStream();

      } catch (error: any) {
        clearTimeout(timeout);
        reject(error);
      }
    });

  } catch (error: any) {
    console.error(`Stream data parsing error: ${error.message}`);
    return { station: "Unknown", title: "Metadata unavailable" };
  }
}
