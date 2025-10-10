// Stream Metadata Extraction Tool
// Extracts "now playing" info from Icecast/Shoutcast streams

interface StreamMetadata {
  title?: string;
  artist?: string;
  song?: string;
  station?: string;
  genre?: string;
  bitrate?: string;
  description?: string;
}

/**
 * Extract metadata from Icecast/Shoutcast stream
 * Makes a HEAD request with Icy-MetaData: 1 header
 */
export async function extractIcecastMetadata(
  url: string
): Promise<StreamMetadata> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "Icy-MetaData": "1",
        "User-Agent": "WaveFunc/1.0",
      },
    });

    const metadata: StreamMetadata = {};

    // Extract Icecast headers
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

    // If no metadata found, try a GET request to parse stream
    if (!metadata.title && !metadata.station) {
      return await extractFromStreamData(url, headers);
    }

    return metadata;
  } catch (error: any) {
    console.error(`Stream metadata extraction error: ${error.message}`);
    throw new Error(`Failed to extract metadata: ${error.message}`);
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
 * Extract metadata by reading stream data
 * (More complex - parses actual stream bytes for metadata)
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
    const metaint = parseInt(metaintStr);
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

    const reader = response.body.getReader();
    const metadataInterval = metaint;
    const metadata: StreamMetadata = {};

    // Read first chunk to get metadata
    let bytesRead = 0;
    const maxBytes = metadataInterval + 4096; // Read one interval + some metadata

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;

      // Check if we've passed the metadata point
      if (bytesRead >= metadataInterval) {
        // Try to parse metadata from bytes
        const text = new TextDecoder().decode(value);
        const titleMatch = text.match(/StreamTitle='([^']+)'/);
        if (titleMatch && titleMatch[1]) {
          metadata.title = titleMatch[1];
          parseTitle(titleMatch[1], metadata);
        }
        break;
      }
    }

    reader.cancel();
    return metadata;
  } catch (error: any) {
    console.error(`Stream data parsing error: ${error.message}`);
    return { station: "Unknown", title: "Metadata unavailable" };
  }
}
