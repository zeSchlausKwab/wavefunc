// MusicBrainz API Tool
// Searches MusicBrainz for detailed track information

import type {
  MusicBrainzArtist,
  MusicBrainzRelease,
  MusicBrainzRecording,
  MusicBrainzLabel,
} from "../schemas.ts";

const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
const USER_AGENT = "WaveFunc/1.0 (https://github.com/wavefunc)";

/**
 * Search for artists on MusicBrainz
 * @param query - Artist name to search for
 * @param limit - Maximum number of results to return
 */
export async function searchArtists(
  query: string,
  limit = 10
): Promise<MusicBrainzArtist[]> {
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
    type: "artist" as const,
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
 * Search for releases (albums) on MusicBrainz
 * @param query - Release/album title to search for
 * @param limit - Maximum number of results to return
 * @param artist - Optional artist name to filter results
 */
export async function searchReleases(
  query: string,
  limit = 10,
  artist?: string
): Promise<MusicBrainzRelease[]> {
  const url = new URL(`${MUSICBRAINZ_API}/release`);

  // Build search query based on what's provided
  const queryParts: string[] = [];

  if (query && query.trim() !== "") {
    queryParts.push(`release:${query}~2`);
  }

  if (artist && artist.trim() !== "") {
    queryParts.push(`artist:${artist}~2`);
  }

  if (queryParts.length === 0) {
    throw new Error("At least one search parameter (query or artist) must be provided");
  }

  const searchQuery = queryParts.join(" AND ");

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
    type: "release" as const,
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
 * Search for recordings (songs/tracks) on MusicBrainz
 * @param query - Recording/track title to search for
 * @param artist - Optional artist name to filter results
 * @param limit - Maximum number of results to return
 */
export async function searchRecordings(
  query: string,
  artist?: string,
  limit = 10
): Promise<MusicBrainzRecording[]> {
  const url = new URL(`${MUSICBRAINZ_API}/recording`);

  // Build search query based on what's provided
  const queryParts: string[] = [];

  if (query && query.trim() !== "") {
    queryParts.push(`recording:${query}~2`);
  }

  if (artist && artist.trim() !== "") {
    queryParts.push(`artist:${artist}~2`);
  }

  if (queryParts.length === 0) {
    throw new Error("At least one search parameter (query or artist) must be provided");
  }

  const searchQuery = queryParts.join(" AND ");

  url.searchParams.set("query", searchQuery);
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
    type: "recording" as const,
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
 * Search for labels on MusicBrainz
 * @param query - Label name to search for
 * @param limit - Maximum number of results to return
 */
export async function searchLabels(
  query: string,
  limit = 10
): Promise<MusicBrainzLabel[]> {
  const url = new URL(`${MUSICBRAINZ_API}/label`);
  url.searchParams.set("query", `label:${query}~2`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", limit.toString());

  console.log(`🔍 Label search: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  const data = await response.json();
  const labels = data.labels || [];

  return labels.map((label: any) => ({
    id: label.id,
    type: "label" as const,
    name: label.name,
    sortName: label["sort-name"],
    country: label.country,
    type_: label.type?.toLowerCase(),
    labelCode: label["label-code"] ? String(label["label-code"]) : undefined,
    disambiguation: label.disambiguation,
    score: label.score || 0,
    tags: label.tags?.map((t: any) => t.name),
  }));
}

/**
 * Advanced combined search for recordings using Lucene query syntax
 * This is useful when you need precise results combining multiple fields
 *
 * @param params - Combined search parameters
 * @param params.recording - Recording/track title (supports exact phrases with quotes)
 * @param params.artist - Artist name (supports exact phrases with quotes)
 * @param params.release - Release/album name (optional)
 * @param params.isrc - International Standard Recording Code (optional)
 * @param params.country - Country code (optional)
 * @param params.date - Release date (optional, YYYY or YYYY-MM-DD)
 * @param params.duration - Duration in milliseconds (optional)
 * @param limit - Maximum number of results to return
 *
 * @example
 * // Search for exact recording by exact artist
 * searchRecordingsCombined({
 *   recording: '"young men dead"',
 *   artist: '"the black angels"'
 * })
 *
 * @example
 * // Fuzzy search with partial matches
 * searchRecordingsCombined({
 *   recording: 'young men',
 *   artist: 'black angels'
 * })
 */
export async function searchRecordingsCombined(
  params: {
    recording?: string;
    artist?: string;
    release?: string;
    isrc?: string;
    country?: string;
    date?: string;
    duration?: number;
  },
  limit = 10
): Promise<MusicBrainzRecording[]> {
  const url = new URL(`${MUSICBRAINZ_API}/recording`);

  // Build Lucene query combining all provided fields
  const queryParts: string[] = [];

  if (params.recording) {
    // Use exact phrase if quoted, otherwise fuzzy search with ~2
    const recordingQuery = params.recording.includes('"')
      ? `recording:${params.recording}`
      : `recording:"${params.recording}"~2`;
    queryParts.push(recordingQuery);
  }

  if (params.artist) {
    // Use exact phrase if quoted, otherwise fuzzy search with ~2
    const artistQuery = params.artist.includes('"')
      ? `artist:${params.artist}`
      : `artist:"${params.artist}"~2`;
    queryParts.push(artistQuery);
  }

  if (params.release) {
    const releaseQuery = params.release.includes('"')
      ? `release:${params.release}`
      : `release:"${params.release}"~2`;
    queryParts.push(releaseQuery);
  }

  if (params.isrc) {
    queryParts.push(`isrc:${params.isrc}`);
  }

  if (params.country) {
    queryParts.push(`country:${params.country}`);
  }

  if (params.date) {
    queryParts.push(`date:${params.date}`);
  }

  if (params.duration) {
    // Duration search with some tolerance (±5 seconds)
    const durationSec = Math.floor(params.duration / 1000);
    queryParts.push(`dur:[${durationSec - 5} TO ${durationSec + 5}]`);
  }

  if (queryParts.length === 0) {
    throw new Error("At least one search parameter must be provided");
  }

  // Combine all parts with AND
  const searchQuery = queryParts.join(" AND ");

  url.searchParams.set("query", searchQuery);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", limit.toString());

  console.log(`🔍 Combined recording search: ${url.toString()}`);

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
    type: "recording" as const,
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
