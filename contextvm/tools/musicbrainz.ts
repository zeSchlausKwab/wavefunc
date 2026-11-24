// Resilient Multi-Source Music Metadata Tool
// Primary: MusicBrainz WS2 (serialized 1 req/s queue + proper Lucene escaping + backoff + cache)
// Fallbacks: Deezer Public API -> Apple iTunes Search API (zero API keys required)

import type {
  MusicBrainzArtist,
  MusicBrainzRelease,
  MusicBrainzRecording,
  MusicBrainzLabel,
} from "../schemas.ts";

const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
const DEEZER_API = "https://api.deezer.com";
const ITUNES_API = "https://itunes.apple.com/search";
const USER_AGENT = "WaveFunc/0.2.0 (https://wavefunc.live)";

const MB_MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

// ─── Serialized 1.1 req/s MusicBrainz Queue & Circuit Breaker ─────────────────

let mbQueueTail: Promise<unknown> = Promise.resolve();
let mbLastRequestAt = 0;
let mbCooldownUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Escape Lucene special characters so arbitrary titles/artists never trigger HTTP 400. */
export function escapeLuceneTerm(raw: string): string {
  return raw
    .trim()
    .replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1")
    .replace(/\s+/g, " ");
}

/** Build a safe Lucene field clause (quotes multi-word phrases, keeps fuzzy matching for single tokens). */
export function buildLuceneClause(field: string, raw: string, fuzzy = true): string {
  const cleaned = raw.trim().replace(/"/g, "").replace(/\s+/g, " ");
  if (!cleaned) return "";
  const escaped = escapeLuceneTerm(cleaned);
  if (cleaned.includes(" ")) {
    return fuzzy ? `${field}:"${escaped}"~2` : `${field}:"${escaped}"`;
  }
  return fuzzy && cleaned.length >= 4 ? `${field}:${escaped}~1` : `${field}:${escaped}`;
}

// ─── LRU TTL Cache & In-Flight Deduplication ─────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = queryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return undefined;
  }
  // Refresh LRU order
  queryCache.delete(key);
  queryCache.set(key, entry);
  return entry.value as T;
}

function setCached<T>(key: string, value: T): void {
  if (queryCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then((result) => {
      if (Array.isArray(result) ? result.length > 0 : Boolean(result)) {
        setCached(key, result);
      }
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Enqueue a MusicBrainz HTTP fetch strictly respecting the 1 req/sec rate limit,
 * with bounded retry/backoff on 429/503 and short circuit-breaker cooldown so
 * fallback providers respond immediately when MusicBrainz is overloaded.
 */
async function fetchMusicBrainzJson(url: string, maxAttempts = 2): Promise<any> {
  if (Date.now() < mbCooldownUntil) {
    throw new Error("MusicBrainz temporarily rate-limited (cooldown active)");
  }

  let lastError: Error = new Error("MusicBrainz request failed");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const run = async () => {
      const waitMs = mbLastRequestAt + MB_MIN_INTERVAL_MS - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      mbLastRequestAt = Date.now();

      return fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    };

    const next = mbQueueTail.then(run, run);
    mbQueueTail = next.catch(() => undefined);

    let response: Response;
    try {
      response = await next;
    } catch (err: any) {
      lastError = new Error(`MusicBrainz network error: ${err?.message ?? err}`);
      if (attempt < maxAttempts) {
        await sleep(600 * attempt);
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      return await response.json();
    }

    if (response.status === 429 || response.status === 503) {
      const retryAfterSec = Number(response.headers.get("Retry-After"));
      const delayMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, 4000)
          : 1200 * attempt;
      lastError = new Error(`MusicBrainz API rate-limited: ${response.status}`);
      if (attempt < maxAttempts) {
        await sleep(delayMs);
        continue;
      }
      // Short 20s circuit-breaker so other callers hop straight to Deezer/iTunes.
      mbCooldownUntil = Date.now() + 20_000;
      throw lastError;
    }

    if (response.status >= 500 && attempt < maxAttempts) {
      lastError = new Error(`MusicBrainz API error: ${response.status}`);
      await sleep(750 * attempt);
      continue;
    }

    throw new Error(`MusicBrainz API error: ${response.status}`);
  }

  throw lastError;
}

// ─── Secondary Providers: Deezer & Apple iTunes ──────────────────────────────

async function fetchJsonWithTimeout(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function searchDeezerRecordings(
  query: string,
  artist: string | undefined,
  limit: number,
): Promise<MusicBrainzRecording[]> {
  const q = artist ? `track:"${query}" artist:"${artist}"` : query;
  const url = new URL(`${DEEZER_API}/search/track`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(Math.min(limit, 25)));

  const data = await fetchJsonWithTimeout(url.toString());
  const items: any[] = Array.isArray(data?.data) ? data.data : [];
  return items.map((item, idx) => ({
    id: `deezer:${item.id}`,
    type: "recording" as const,
    title: String(item.title ?? ""),
    artist: String(item.artist?.name ?? "Unknown"),
    artistId: item.artist?.id ? `deezer-artist:${item.artist.id}` : undefined,
    release: item.album?.title ? String(item.album.title) : undefined,
    releaseId: item.album?.id ? `deezer-album:${item.album.id}` : undefined,
    releaseDate: undefined,
    duration: typeof item.duration === "number" ? Math.round(item.duration * 1000) : undefined,
    score: Math.max(50, 95 - idx * 3),
    tags: [],
  }));
}

async function searchItunesRecordings(
  query: string,
  artist: string | undefined,
  limit: number,
): Promise<MusicBrainzRecording[]> {
  const term = artist ? `${artist} ${query}` : query;
  const url = new URL(ITUNES_API);
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", String(Math.min(limit, 25)));

  const data = await fetchJsonWithTimeout(url.toString());
  const items: any[] = Array.isArray(data?.results) ? data.results : [];
  return items
    .filter((item) => item?.trackName)
    .map((item, idx) => ({
      id: `itunes:${item.trackId ?? idx}`,
      type: "recording" as const,
      title: String(item.trackName),
      artist: String(item.artistName ?? "Unknown"),
      artistId: item.artistId ? `itunes-artist:${item.artistId}` : undefined,
      release: item.collectionName ? String(item.collectionName) : undefined,
      releaseId: item.collectionId ? `itunes-album:${item.collectionId}` : undefined,
      releaseDate:
        typeof item.releaseDate === "string"
          ? item.releaseDate.slice(0, 10)
          : undefined,
      duration:
        typeof item.trackTimeMillis === "number"
          ? Math.round(item.trackTimeMillis)
          : undefined,
      score: Math.max(50, 92 - idx * 3),
      tags: item.primaryGenreName ? [String(item.primaryGenreName).toLowerCase()] : [],
    }));
}

async function searchDeezerArtists(
  query: string,
  limit: number,
): Promise<MusicBrainzArtist[]> {
  const url = new URL(`${DEEZER_API}/search/artist`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(Math.min(limit, 25)));
  const data = await fetchJsonWithTimeout(url.toString());
  const items: any[] = Array.isArray(data?.data) ? data.data : [];
  return items.map((a, idx) => ({
    id: `deezer-artist:${a.id}`,
    type: "artist" as const,
    name: String(a.name ?? ""),
    sortName: String(a.name ?? ""),
    score: Math.max(50, 95 - idx * 3),
    tags: [],
  }));
}

async function searchItunesArtists(
  query: string,
  limit: number,
): Promise<MusicBrainzArtist[]> {
  const url = new URL(ITUNES_API);
  url.searchParams.set("term", query);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "musicArtist");
  url.searchParams.set("limit", String(Math.min(limit, 25)));
  const data = await fetchJsonWithTimeout(url.toString());
  const items: any[] = Array.isArray(data?.results) ? data.results : [];
  return items
    .filter((a) => a?.artistName)
    .map((a, idx) => ({
      id: `itunes-artist:${a.artistId ?? idx}`,
      type: "artist" as const,
      name: String(a.artistName),
      sortName: String(a.artistName),
      score: Math.max(50, 92 - idx * 3),
      tags: a.primaryGenreName ? [String(a.primaryGenreName).toLowerCase()] : [],
    }));
}

async function searchDeezerReleases(
  query: string,
  artist: string | undefined,
  limit: number,
): Promise<MusicBrainzRelease[]> {
  const q = artist ? `album:"${query}" artist:"${artist}"` : query;
  const url = new URL(`${DEEZER_API}/search/album`);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(Math.min(limit, 25)));
  const data = await fetchJsonWithTimeout(url.toString());
  const items: any[] = Array.isArray(data?.data) ? data.data : [];
  return items.map((al, idx) => ({
    id: `deezer-album:${al.id}`,
    type: "release" as const,
    title: String(al.title ?? ""),
    artist: String(al.artist?.name ?? "Unknown"),
    artistId: al.artist?.id ? `deezer-artist:${al.artist.id}` : undefined,
    trackCount: typeof al.nb_tracks === "number" ? al.nb_tracks : undefined,
    score: Math.max(50, 95 - idx * 3),
    tags: [],
  }));
}

async function searchItunesReleases(
  query: string,
  artist: string | undefined,
  limit: number,
): Promise<MusicBrainzRelease[]> {
  const term = artist ? `${artist} ${query}` : query;
  const url = new URL(ITUNES_API);
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", String(Math.min(limit, 25)));
  const data = await fetchJsonWithTimeout(url.toString());
  const items: any[] = Array.isArray(data?.results) ? data.results : [];
  return items
    .filter((al) => al?.collectionName)
    .map((al, idx) => ({
      id: `itunes-album:${al.collectionId ?? idx}`,
      type: "release" as const,
      title: String(al.collectionName),
      artist: String(al.artistName ?? "Unknown"),
      artistId: al.artistId ? `itunes-artist:${al.artistId}` : undefined,
      date:
        typeof al.releaseDate === "string"
          ? al.releaseDate.slice(0, 10)
          : undefined,
      country: al.country ? String(al.country) : undefined,
      trackCount: typeof al.trackCount === "number" ? al.trackCount : undefined,
      score: Math.max(50, 92 - idx * 3),
      tags: al.primaryGenreName ? [String(al.primaryGenreName).toLowerCase()] : [],
    }));
}

async function hopProviders<T>(
  label: string,
  providers: Array<{ name: string; run: () => Promise<T[]> }>,
): Promise<T[]> {
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const results = await provider.run();
      if (results.length > 0) {
        if (provider.name !== providers[0]?.name) {
          console.log(`↪️  ${label} served by fallback provider: ${provider.name} (${results.length} results)`);
        }
        return results;
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      errors.push(`${provider.name}: ${msg}`);
      console.warn(`⚠️  ${label} provider ${provider.name} failed (${msg}), trying next...`);
    }
  }
  if (errors.length === providers.length) {
    throw new Error(`All music metadata providers failed (${errors.join("; ")})`);
  }
  return [];
}

// ─── Public Search Functions ─────────────────────────────────────────────────

export async function searchArtists(
  query: string,
  limit = 10,
): Promise<MusicBrainzArtist[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheKey = `artist:${trimmed.toLowerCase()}:${limit}`;

  return withCache(cacheKey, () =>
    hopProviders(`artist(${trimmed})`, [
      {
        name: "MusicBrainz",
        run: async () => {
          const url = new URL(`${MUSICBRAINZ_API}/artist`);
          url.searchParams.set("query", buildLuceneClause("artist", trimmed));
          url.searchParams.set("fmt", "json");
          url.searchParams.set("limit", String(limit));
          const data = await fetchMusicBrainzJson(url.toString());
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
        },
      },
      { name: "Deezer", run: () => searchDeezerArtists(trimmed, limit) },
      { name: "iTunes", run: () => searchItunesArtists(trimmed, limit) },
    ]),
  );
}

export async function searchReleases(
  query: string,
  limit = 10,
  artist?: string,
): Promise<MusicBrainzRelease[]> {
  const trimmed = query.trim();
  const cleanArtist = artist?.trim() || undefined;
  if (!trimmed) return [];
  const cacheKey = `release:${trimmed.toLowerCase()}:${cleanArtist?.toLowerCase() ?? ""}:${limit}`;

  return withCache(cacheKey, () =>
    hopProviders(`release(${trimmed})`, [
      {
        name: "MusicBrainz",
        run: async () => {
          const url = new URL(`${MUSICBRAINZ_API}/release`);
          const searchQuery = cleanArtist
            ? `${buildLuceneClause("release", trimmed)} AND ${buildLuceneClause("artist", cleanArtist)}`
            : `(${buildLuceneClause("release", trimmed)}^2 OR ${buildLuceneClause("artist", trimmed)})`;
          url.searchParams.set("query", searchQuery);
          url.searchParams.set("fmt", "json");
          url.searchParams.set("limit", String(limit));
          const data = await fetchMusicBrainzJson(url.toString());
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
        },
      },
      { name: "Deezer", run: () => searchDeezerReleases(trimmed, cleanArtist, limit) },
      { name: "iTunes", run: () => searchItunesReleases(trimmed, cleanArtist, limit) },
    ]),
  );
}

export async function searchRecordings(
  query: string,
  artist?: string,
  limit = 10,
): Promise<MusicBrainzRecording[]> {
  const trimmed = query.trim();
  const cleanArtist = artist?.trim() || undefined;
  if (!trimmed) return [];
  const cacheKey = `recording:${trimmed.toLowerCase()}:${cleanArtist?.toLowerCase() ?? ""}:${limit}`;

  return withCache(cacheKey, () =>
    hopProviders(`recording(${trimmed})`, [
      {
        name: "MusicBrainz",
        run: async () => {
          const url = new URL(`${MUSICBRAINZ_API}/recording`);
          const searchQuery = cleanArtist
            ? `${buildLuceneClause("recording", trimmed)} AND ${buildLuceneClause("artist", cleanArtist)}`
            : `(${buildLuceneClause("recording", trimmed)}^2 OR ${buildLuceneClause("artist", trimmed)})`;
          url.searchParams.set("query", searchQuery);
          url.searchParams.set("fmt", "json");
          url.searchParams.set("limit", String(limit));
          const data = await fetchMusicBrainzJson(url.toString());
          const recordings = data.recordings || [];
          return recordings.map((rec: any) => ({
            id: rec.id,
            type: "recording" as const,
            title: rec.title,
            artist: rec["artist-credit"]?.[0]?.name || "Unknown",
            artistId: rec["artist-credit"]?.[0]?.artist?.id,
            release: rec.releases?.[0]?.title,
            releaseId: rec.releases?.[0]?.id,
            releaseDate: rec.releases?.[0]?.date,
            duration: typeof rec.length === "number" ? Math.round(rec.length) : undefined,
            score: rec.score || 0,
            tags: rec.tags?.map((t: any) => t.name),
          }));
        },
      },
      { name: "Deezer", run: () => searchDeezerRecordings(trimmed, cleanArtist, limit) },
      { name: "iTunes", run: () => searchItunesRecordings(trimmed, cleanArtist, limit) },
    ]),
  );
}

export async function searchLabels(
  query: string,
  limit = 10,
): Promise<MusicBrainzLabel[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheKey = `label:${trimmed.toLowerCase()}:${limit}`;

  return withCache(cacheKey, async () => {
    const url = new URL(`${MUSICBRAINZ_API}/label`);
    url.searchParams.set("query", buildLuceneClause("label", trimmed));
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", String(limit));

    const data = await fetchMusicBrainzJson(url.toString());
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
  });
}

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
  limit = 10,
): Promise<MusicBrainzRecording[]> {
  const queryParts: string[] = [];

  if (params.recording?.trim()) {
    queryParts.push(buildLuceneClause("recording", params.recording));
  }
  if (params.artist?.trim()) {
    queryParts.push(buildLuceneClause("artist", params.artist));
  }
  if (params.release?.trim()) {
    queryParts.push(buildLuceneClause("release", params.release));
  }
  if (params.isrc?.trim()) {
    queryParts.push(`isrc:${escapeLuceneTerm(params.isrc)}`);
  }
  if (params.country?.trim()) {
    queryParts.push(`country:${escapeLuceneTerm(params.country)}`);
  }
  if (params.date?.trim()) {
    queryParts.push(`date:${escapeLuceneTerm(params.date)}`);
  }
  if (params.duration) {
    const durationSec = Math.floor(params.duration / 1000);
    queryParts.push(`dur:[${Math.max(0, durationSec - 5)} TO ${durationSec + 5}]`);
  }

  if (queryParts.length === 0) {
    throw new Error("At least one search parameter must be provided");
  }

  const searchQuery = queryParts.join(" AND ");
  const cacheKey = `combined:${searchQuery.toLowerCase()}:${limit}`;
  const fallbackQuery =
    params.recording?.trim() || params.release?.trim() || params.artist?.trim() || "";
  const fallbackArtist = params.recording?.trim() ? params.artist?.trim() : undefined;

  return withCache(cacheKey, () =>
    hopProviders(`combined(${fallbackQuery})`, [
      {
        name: "MusicBrainz",
        run: async () => {
          const url = new URL(`${MUSICBRAINZ_API}/recording`);
          url.searchParams.set("query", searchQuery);
          url.searchParams.set("fmt", "json");
          url.searchParams.set("limit", String(limit));
          const data = await fetchMusicBrainzJson(url.toString());
          const recordings = data.recordings || [];
          return recordings.map((rec: any) => ({
            id: rec.id,
            type: "recording" as const,
            title: rec.title,
            artist: rec["artist-credit"]?.[0]?.name || "Unknown",
            artistId: rec["artist-credit"]?.[0]?.artist?.id,
            release: rec.releases?.[0]?.title,
            releaseId: rec.releases?.[0]?.id,
            releaseDate: rec.releases?.[0]?.date,
            duration: typeof rec.length === "number" ? Math.round(rec.length) : undefined,
            score: rec.score || 0,
            tags: rec.tags?.map((t: any) => t.name),
          }));
        },
      },
      ...(fallbackQuery
        ? [
            {
              name: "Deezer",
              run: () => searchDeezerRecordings(fallbackQuery, fallbackArtist, limit),
            },
            {
              name: "iTunes",
              run: () => searchItunesRecordings(fallbackQuery, fallbackArtist, limit),
            },
          ]
        : []),
    ]),
  );
}

export async function getRecordingDetails(mbid: string): Promise<any> {
  const url = `${MUSICBRAINZ_API}/recording/${encodeURIComponent(mbid)}?fmt=json&inc=artists+releases+tags`;
  return withCache(`details:${mbid}`, () => fetchMusicBrainzJson(url));
}

export function getMusicMetadataStats() {
  return {
    cacheEntries: queryCache.size,
    inFlight: inFlight.size,
    musicBrainzCooldownMs: Math.max(0, mbCooldownUntil - Date.now()),
  };
}
