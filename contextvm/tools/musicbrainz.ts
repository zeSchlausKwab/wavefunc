// MusicBrainz API Tool
// Searches MusicBrainz for detailed track information

export interface MusicBrainzSearchParams {
  artist?: string;
  track?: string;
  query?: string;
}

export interface MusicBrainzResult {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  release?: string;
  releaseDate?: string;
  duration?: number; // in milliseconds
  score: number;
  tags?: string[];
  type?: 'recording' | 'artist' | 'release'; // What type of entity was matched
}

const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
const USER_AGENT = "WaveFunc/1.0 (https://github.com/wavefunc)";

/**
 * Search MusicBrainz with comprehensive fuzzy matching
 *
 * Searches across recordings, artists, and releases (albums) using fuzzy matching.
 * Example: "led zeppelin" will find:
 * - Artist "Led Zeppelin" (highest priority)
 * - Albums by "Led Zeppelin"
 * - Songs by "Led Zeppelin"
 *
 * Uses Lucene query syntax with proper boosting for better relevance
 */
export async function searchMusicBrainz(
  params: MusicBrainzSearchParams
): Promise<MusicBrainzResult[]> {
  try {
    const results: MusicBrainzResult[] = [];

    // For single query search, search all three entity types separately
    // This gives much better results than trying to combine them
    if (params.query) {
      const cleanQuery = params.query.replace(/[^\w\s]/g, '').trim();

      // Search artists first (often most relevant for simple queries like "led zeppelin")
      const artistResults = await searchArtists(cleanQuery);
      results.push(...artistResults);

      // Search releases (albums)
      const releaseResults = await searchReleases(cleanQuery);
      results.push(...releaseResults);

      // Search recordings (songs) - but limit if we already have good artist/album matches
      const recordingLimit = artistResults.length > 0 ? 5 : 10;
      const recordingResults = await searchRecordings(cleanQuery, undefined, recordingLimit);
      results.push(...recordingResults);

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Return top 10 across all types
      return results.slice(0, 10);
    }
    // Artist + track search - focus on recordings
    else if (params.artist && params.track) {
      return await searchRecordings(params.track, params.artist, 10);
    }
    // Artist-only search
    else if (params.artist) {
      return await searchArtists(params.artist);
    }
    // Track-only search - search recordings and releases
    else if (params.track) {
      const recordingResults = await searchRecordings(params.track, undefined, 7);
      const releaseResults = await searchReleases(params.track, 3);
      return [...recordingResults, ...releaseResults].sort((a, b) => b.score - a.score);
    }
    else {
      throw new Error("Must provide query, artist, or track");
    }
  } catch (error: any) {
    console.error(`MusicBrainz search error: ${error.message}`);
    throw new Error(`MusicBrainz search failed: ${error.message}`);
  }
}

/**
 * Search for artists
 */
async function searchArtists(query: string, limit = 3): Promise<MusicBrainzResult[]> {
  const url = new URL(`${MUSICBRAINZ_API}/artist`);
  url.searchParams.set("query", `artist:${query}~2`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", limit.toString());

  console.log(`🔍 Artist search: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  const data = await response.json();
  const artists = data.artists || [];

  return artists.map((artist: any) => ({
    id: artist.id,
    type: 'artist' as const,
    name: artist.name,
    sortName: artist["sort-name"],
    country: artist.country,
    beginDate: artist["life-span"]?.begin,
    endDate: artist["life-span"]?.end,
    type_: artist.type?.toLowerCase(),
    disambiguation: artist.disambiguation,
    score: artist.score || 0,
    tags: artist.tags?.map((t: any) => t.name),
  }));
}

/**
 * Search for releases (albums)
 */
async function searchReleases(query: string, limit = 3, artist?: string): Promise<MusicBrainzResult[]> {
  const url = new URL(`${MUSICBRAINZ_API}/release`);

  let searchQuery: string;
  if (artist) {
    searchQuery = `release:${query}~2 AND artist:${artist}~2`;
  } else {
    // Boost releases where query appears in title OR artist name
    searchQuery = `(release:${query}~2^2 OR artist:${query}~2)`;
  }

  url.searchParams.set("query", searchQuery);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", limit.toString());

  console.log(`🔍 Release search: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  const data = await response.json();
  const releases = data.releases || [];

  return releases.map((release: any) => ({
    id: release.id,
    type: 'release' as const,
    title: release.title,
    artist: release["artist-credit"]?.[0]?.name || "Unknown",
    artistId: release["artist-credit"]?.[0]?.artist?.id,
    date: release.date,
    country: release.country,
    trackCount: release["track-count"],
    status: release.status?.toLowerCase(),
    barcode: release.barcode,
    score: release.score || 0,
    tags: release.tags?.map((t: any) => t.name),
  }));
}

/**
 * Search for recordings (songs)
 */
async function searchRecordings(
  track: string,
  artist?: string,
  limit = 10
): Promise<MusicBrainzResult[]> {
  const url = new URL(`${MUSICBRAINZ_API}/recording`);

  let query: string;
  if (artist) {
    // Specific artist + track search
    query = `recording:${track}~2 AND artist:${artist}~2`;
  } else {
    // Track search - boost exact matches in recording title, also check artist
    query = `(recording:${track}~2^2 OR artist:${track}~2)`;
  }

  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", limit.toString());

  console.log(`🔍 Recording search: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  const data = await response.json();
  const recordings = data.recordings || [];

  return recordings.map((rec: any) => ({
    id: rec.id,
    type: 'recording' as const,
    title: rec.title,
    artist: rec["artist-credit"]?.[0]?.name || "Unknown",
    artistId: rec["artist-credit"]?.[0]?.artist?.id,
    release: rec.releases?.[0]?.title,
    releaseDate: rec.releases?.[0]?.date,
    duration: rec.length,
    score: rec.score || 0,
    tags: rec.tags?.map((t: any) => t.name),
  }));
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
