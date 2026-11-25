import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateEvent, type NostrEvent } from "nostr-tools/pure";
import { GENRE_INDEX_PAGE_SIZE, RECENT_STATION_LIMIT, genreDisplayName, genrePath, genreSlug, type GenreEntry } from "../genres";
import { publicStationPointer } from "../publicPageMetadata";
import type { CatalogResult } from "./publicCatalog";
import { sitemapBucket, type SitemapBucketCount, type SitemapKind } from "./sitemaps";

export const directoryPath = () => process.env.PUBLIC_DIRECTORY_DB ?? join(process.cwd(), ".cache", "station-directory.sqlite");
export const DIRECTORY_REFRESH_MS = 60 * 60_000;

function connect(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS stations (
      address TEXT PRIMARY KEY, id TEXT NOT NULL, created INTEGER NOT NULL, name TEXT NOT NULL, json TEXT NOT NULL, bucket INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS stations_bucket ON stations(bucket, address);
    CREATE TABLE IF NOT EXISTS aliases (id TEXT PRIMARY KEY, address TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS genres (slug TEXT PRIMARY KEY, name TEXT NOT NULL, count INTEGER NOT NULL, bucket INTEGER NOT NULL, search_text TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS genres_bucket ON genres(bucket, slug);
    CREATE TABLE IF NOT EXISTS membership (slug TEXT NOT NULL, address TEXT NOT NULL, PRIMARY KEY(slug, address)) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS membership_address ON membership(address);
    CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), completed INTEGER NOT NULL);
  `);
  return db;
}

/** The exporter verifies event signatures in a consistent read transaction. A failed or interrupted export
 * throws before COMMIT, so concurrent web requests keep reading the last complete directory. */
export async function importStations(path: string, events: AsyncIterable<NostrEvent> | Iterable<NostrEvent>) {
  const db = connect(path);
  try {
    db.exec("BEGIN IMMEDIATE; CREATE TEMP TABLE seen (address TEXT PRIMARY KEY) WITHOUT ROWID");
    const mark = db.prepare("INSERT OR IGNORE INTO seen VALUES (?)");
    const previous = db.query<{ id: string; created: number }, [string]>("SELECT id, created FROM stations WHERE address = ?");
    const put = db.prepare("INSERT OR REPLACE INTO stations VALUES (?, ?, ?, ?, ?, ?)");
    const alias = db.prepare("INSERT OR IGNORE INTO aliases VALUES (?, ?)");
    const reset = db.prepare("DELETE FROM membership WHERE address = ?");
    const genre = db.prepare("INSERT INTO genres VALUES (?, ?, 0, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = min(name, excluded.name)");
    const member = db.prepare("INSERT OR IGNORE INTO membership VALUES (?, ?)");
    let skipped = 0;
    for await (const event of events) {
      if (event.kind !== 31237 || !validateEvent(event) || !/^[0-9a-f]{64}$/.test(event.id)) throw new Error("Invalid station in directory export");
      const d = event.tags.find(([tag]) => tag === "d")?.[1];
      if (d === undefined || Buffer.byteLength(d) > 255) { skipped++; continue; }
      const address = publicStationPointer(event);
      const first = mark.run(address).changes > 0;
      const old = previous.get(address);
      if (event.id === old?.id) continue;
      alias.run(event.id, address);
      if (!first && old && (old.created > event.created_at || (old.created === event.created_at && old.id < event.id))) continue;
      const name = event.tags.find(([tag]) => tag === "name")?.[1] ?? "";
      put.run(address, event.id, event.created_at, name, JSON.stringify(event), sitemapBucket(address));
      reset.run(address);
      for (const [tag, value, role] of event.tags) {
        if (tag !== "c" || role !== "genre" || !value) continue;
        const slug = genreSlug(value);
        if (!slug) continue;
        const name = genreDisplayName(value);
        genre.run(slug, name, sitemapBucket(slug), value.trim().replace(/\s+/gu, " ").toLowerCase().normalize("NFC"));
        member.run(slug, address);
      }
    }
    db.exec(`
      DELETE FROM membership WHERE address NOT IN (SELECT address FROM seen);
      DELETE FROM stations WHERE address NOT IN (SELECT address FROM seen);
      UPDATE genres SET count = (SELECT count(*) FROM membership WHERE membership.slug = genres.slug);
      DELETE FROM genres WHERE count = 0;
    `);
    db.prepare("INSERT OR REPLACE INTO snapshot VALUES (1, ?)").run(Date.now());
    const counts = db.query<{ stations: number; genres: number }, []>("SELECT (SELECT count(*) FROM stations) AS stations, (SELECT count(*) FROM genres) AS genres").get()!;
    db.exec("COMMIT");
    return { ...counts, skipped };
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

export function openDirectoryIndex(path: string) {
  const db = connect(path);
  const timestamp = db.query<{ completed: number }, []>("SELECT completed FROM snapshot WHERE id = 1");
  const completed = () => timestamp.get()?.completed ?? 0;
  const genreCount = db.query<{total: number}, [string]>("SELECT count(*) AS total FROM genres WHERE instr(search_text, ?) > 0");
  const listedGenres = db.query<GenreEntry, [string, number, number]>(`
    SELECT slug, name, count FROM genres WHERE instr(search_text, ?) > 0 ORDER BY count DESC, slug LIMIT ? OFFSET ?
  `);
  const oneGenre = db.query<GenreEntry, [string]>("SELECT slug, name, count FROM genres WHERE slug = ?");
  const members = db.query<{ json: string }, [string, number]>(`
    SELECT s.json FROM membership m JOIN stations s ON s.address = m.address WHERE m.slug = ?
    ORDER BY s.created DESC, s.address LIMIT ?
  `);
  const oneStation = db.query<{json: string}, [string]>("SELECT json FROM stations WHERE address = ?");
  const alias = db.query<{address: string}, [string]>("SELECT address FROM aliases WHERE id = ?");
  const unavailable = { status: "unavailable" } as const;
  const missing = { status: "missing" } as const;
  const found = <T>(value: T) => ({ status: "found", value }) as const;
  const buckets = db.query<SitemapBucketCount, []>(`
    SELECT 'stations' AS kind, bucket, count(*) AS count FROM stations GROUP BY bucket
    UNION ALL SELECT 'genres' AS kind, bucket, count(*) AS count FROM genres GROUP BY bucket
    ORDER BY kind, bucket
  `);
  const stationPaths = db.query<{address: string}, [number, number, number]>("SELECT address FROM stations WHERE bucket = ? ORDER BY address LIMIT ? OFFSET ?");
  const genrePaths = db.query<{slug: string}, [number, number, number]>("SELECT slug FROM genres WHERE bucket = ? ORDER BY slug LIMIT ? OFFSET ?");
  return {
    completed,
    close: () => db.close(),
    addressForId: (id: string) => alias.get(id)?.address,
    station(address: string) {
      const row = oneStation.get(address);
      return row ? JSON.parse(row.json) as NostrEvent : undefined;
    },
    async genres(page: number, query: string) {
      if (!completed()) return unavailable;
      const filter = query.toLowerCase().normalize("NFC");
      return db.transaction(() => {
        const total = genreCount.get(filter)!.total;
        if (!Number.isSafeInteger(page) || page < 1 || page > Math.max(1, Math.ceil(total / GENRE_INDEX_PAGE_SIZE))) return missing;
        const genres = listedGenres.all(filter, GENRE_INDEX_PAGE_SIZE, (page - 1) * GENRE_INDEX_PAGE_SIZE);
        return found({ genres, total, page, query });
      })();
    },
    async genre(slug: string, page: number) {
      if (!completed()) return unavailable;
      // Count and page contents must refer to the same snapshot during a concurrent refresh.
      return db.transaction(() => {
        const genre = oneGenre.get(slug);
        // Previously each 32-station page had a public URL. Recognize those links
        // so the HTTP route can redirect them to the current genre directory.
        if (!genre || !Number.isSafeInteger(page) || page < 1 || page > Math.ceil(genre.count / 32)) return missing;
        const events = members.all(slug, RECENT_STATION_LIMIT).map(row => JSON.parse(row.json) as NostrEvent);
        return found({ genre, page: 1, events });
      })();
    },
    async sitemapBuckets(): Promise<CatalogResult<SitemapBucketCount[]>> {
      return completed() ? found(buckets.all()) : unavailable;
    },
    async sitemapPaths(kind: SitemapKind, bucket: number, offset: number, limit: number): Promise<CatalogResult<string[]>> {
      if (!completed()) return unavailable;
      const paths = kind === "stations" ? stationPaths.all(bucket, limit, offset).map(row => "/station/" + row.address)
        : genrePaths.all(bucket, limit, offset).map(row => genrePath(row.slug));
      return paths.length ? found(paths) : missing;
    },
  };
}
