// MusicBrainz API Tool
// Searches MusicBrainz for detailed track information

interface MusicBrainzSearchParams {
  artist?: string;
  track?: string;
  query?: string;
}

interface MusicBrainzResult {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  release?: string;
  releaseDate?: string;
  duration?: number; // in milliseconds
  score: number;
  tags?: string[];
}

const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
const USER_AGENT = "WaveFunc/1.0 (https://github.com/wavefunc)";

/**
 * Search MusicBrainz for recordings
 */
export async function searchMusicBrainz(
  params: MusicBrainzSearchParams
): Promise<MusicBrainzResult[]> {
  let query: string;

  // Build search query
  if (params.query) {
    query = params.query;
  } else if (params.artist && params.track) {
    query = `artist:"${params.artist}" AND recording:"${params.track}"`;
  } else if (params.artist) {
    query = `artist:"${params.artist}"`;
  } else if (params.track) {
    query = `recording:"${params.track}"`;
  } else {
    throw new Error("Must provide query, artist, or track");
  }

  const url = new URL(`${MUSICBRAINZ_API}/recording`);
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "5");

  try {
    console.log(`🔍 MusicBrainz API: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `MusicBrainz API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const recordings = data.recordings || [];

    return recordings.map((rec: any) => {
      const result: MusicBrainzResult = {
        id: rec.id,
        title: rec.title,
        artist:
          rec["artist-credit"]?.[0]?.name ||
          rec["artist-credit"]?.[0]?.artist?.name ||
          "Unknown",
        artistId: rec["artist-credit"]?.[0]?.artist?.id,
        score: rec.score || 0,
      };

      // Add release info if available
      if (rec.releases && rec.releases.length > 0) {
        const release = rec.releases[0];
        result.release = release.title;
        result.releaseDate = release.date;
      }

      // Add duration if available
      if (rec.length) {
        result.duration = rec.length;
      }

      // Add tags if available
      if (rec.tags && rec.tags.length > 0) {
        result.tags = rec.tags.map((t: any) => t.name);
      }

      return result;
    });
  } catch (error: any) {
    console.error(`MusicBrainz search error: ${error.message}`);
    throw new Error(`MusicBrainz search failed: ${error.message}`);
  }
}

/**
 * Get detailed recording information by MusicBrainz ID
 */
export async function getRecordingDetails(mbid: string): Promise<any> {
  const url = `${MUSICBRAINZ_API}/recording/${mbid}?fmt=json&inc=artists+releases+tags`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `MusicBrainz API error: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error: any) {
    console.error(`MusicBrainz details error: ${error.message}`);
    throw new Error(`Failed to get recording details: ${error.message}`);
  }
}
