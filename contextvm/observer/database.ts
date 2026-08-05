import { Database } from "bun:sqlite";
import type { NostrEvent } from "applesauce-core/helpers/event";

import {
  STATION_KIND,
  semanticTrackKey,
  type ParsedStation,
  type StationHealthStatus,
  type StationRankingEntry,
  type StationReportLabel,
  type StationTrack,
} from "../../src/lib/nostr/domain";
import type { StreamMetadata } from "../schemas";

export type ObserverStation = {
  address: string;
  event: NostrEvent;
  streamUrls: string[];
  nextCheckAt: number;
  consecutiveFailures: number;
};

export type HealthCheckRecord = {
  stationAddress: string;
  checkedAt: number;
  reachable: boolean;
  status: StationHealthStatus;
  score: number;
  latencyMs?: number;
  streamUrl?: string;
  resolvedUrl?: string;
  contentType?: string;
  insecure: boolean;
  evidence: string[];
};

type RankingRow = {
  station_address: string;
  value: number;
};

type TrackRow = {
  station_address: string;
  artist: string | null;
  title: string | null;
  last_seen_at: number;
};

type NowPlayingCoverageRow = RankingRow & {
  last_seen_at: number;
};

const DAY_SECONDS = 24 * 60 * 60;
const MAX_HEARTBEAT_CREDIT_SECONDS = 60;

function scheduleOffset(address: string): number {
  let hash = 2166136261;
  for (let index = 0; index < address.length; index += 1) {
    hash ^= address.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % DAY_SECONDS;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export class ObserverDatabase {
  readonly sqlite: Database;

  constructor(path = process.env.OBSERVER_DB_PATH || "data/observer.sqlite") {
    this.sqlite = new Database(path, { create: true });
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS observer_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stations (
        address TEXT PRIMARY KEY,
        event_json TEXT NOT NULL,
        streams_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        next_check_at INTEGER NOT NULL,
        last_checked_at INTEGER,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'unknown',
        score INTEGER NOT NULL DEFAULT 0,
        last_health_publish_at INTEGER,
        last_health_fingerprint TEXT,
        redirect_candidate TEXT,
        redirect_confirmations INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS stations_due_idx ON stations(next_check_at);

      CREATE TABLE IF NOT EXISTS health_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_address TEXT NOT NULL,
        checked_at INTEGER NOT NULL,
        reachable INTEGER NOT NULL,
        status TEXT NOT NULL,
        score INTEGER NOT NULL,
        latency_ms INTEGER,
        stream_url TEXT,
        resolved_url TEXT,
        content_type TEXT,
        insecure INTEGER NOT NULL,
        evidence_json TEXT NOT NULL,
        FOREIGN KEY(station_address) REFERENCES stations(address) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS health_station_time_idx
        ON health_checks(station_address, checked_at DESC);

      CREATE TABLE IF NOT EXISTS listening_sessions (
        session_id TEXT PRIMARY KEY,
        station_address TEXT NOT NULL,
        stream_url TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        heartbeat_count INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS listening_station_time_idx
        ON listening_sessions(station_address, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS listening_heartbeats (
        session_id TEXT NOT NULL,
        station_address TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        credited_seconds INTEGER NOT NULL,
        PRIMARY KEY(session_id, observed_at)
      );
      CREATE INDEX IF NOT EXISTS listening_heartbeat_station_time_idx
        ON listening_heartbeats(station_address, observed_at DESC);

      CREATE TABLE IF NOT EXISTS track_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_address TEXT NOT NULL,
        track_key TEXT NOT NULL,
        artist TEXT,
        title TEXT,
        album TEXT,
        mbid TEXT,
        source TEXT,
        started_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        heartbeat_count INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS track_station_time_idx
        ON track_segments(station_address, last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS published_tracks (
        station_address TEXT PRIMARY KEY,
        track_key TEXT NOT NULL,
        published_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS social_events (
        event_id TEXT PRIMARY KEY,
        station_address TEXT NOT NULL,
        metric TEXT NOT NULL,
        actor_pubkey TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS social_metric_time_idx
        ON social_events(metric, created_at DESC);

      CREATE TABLE IF NOT EXISTS station_reports (
        event_id TEXT PRIMARY KEY,
        station_address TEXT NOT NULL,
        label TEXT NOT NULL,
        reporter_pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reports_station_time_idx
        ON station_reports(station_address, created_at DESC);
    `);
  }

  close() {
    this.sqlite.close();
  }

  getMeta(key: string): string | null {
    const row = this.sqlite
      .query("SELECT value FROM observer_meta WHERE key = ?")
      .get(key) as { value?: string } | null;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string) {
    this.sqlite
      .query(
        `INSERT INTO observer_meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  get stationCount(): number {
    const row = this.sqlite.query("SELECT COUNT(*) AS count FROM stations").get() as {
      count: number;
    };
    return asNumber(row.count);
  }

  upsertStation(station: ParsedStation, now: number) {
    if (!station.address || station.streams.length === 0) return;
    const firstSchedule = now + scheduleOffset(station.address);
    this.sqlite
      .query(
        `INSERT INTO stations(
           address, event_json, streams_json, updated_at, next_check_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
           event_json = excluded.event_json,
           streams_json = excluded.streams_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        station.address,
        JSON.stringify(station.event),
        JSON.stringify(station.streams.map((stream) => stream.url)),
        station.created_at,
        firstSchedule,
      );
  }

  dueStations(now: number, limit: number): ObserverStation[] {
    const rows = this.sqlite
      .query(
        `SELECT address, event_json, streams_json, next_check_at,
                consecutive_failures
         FROM stations
         WHERE next_check_at <= ?
         ORDER BY next_check_at ASC
         LIMIT ?`,
      )
      .all(now, limit) as Array<{
      address: string;
      event_json: string;
      streams_json: string;
      next_check_at: number;
      consecutive_failures: number;
    }>;

    return rows.map((row) => ({
      address: row.address,
      event: JSON.parse(row.event_json) as NostrEvent,
      streamUrls: JSON.parse(row.streams_json) as string[],
      nextCheckAt: asNumber(row.next_check_at),
      consecutiveFailures: asNumber(row.consecutive_failures),
    }));
  }

  isKnownStationStream(stationAddress: string, streamUrl: string): boolean {
    const row = this.sqlite
      .query("SELECT streams_json FROM stations WHERE address = ?")
      .get(stationAddress) as { streams_json: string } | null;
    if (!row) return false;
    try {
      return (JSON.parse(row.streams_json) as string[]).includes(streamUrl);
    } catch {
      return false;
    }
  }

  reportCounts(
    stationAddress: string,
    since: number,
  ): Partial<Record<StationReportLabel, number>> {
    const rows = this.sqlite
      .query(
        `SELECT label, COUNT(DISTINCT reporter_pubkey) AS count
         FROM station_reports
         WHERE station_address = ? AND created_at >= ?
         GROUP BY label`,
      )
      .all(stationAddress, since) as Array<{ label: StationReportLabel; count: number }>;
    return Object.fromEntries(
      rows.map((row) => [row.label, asNumber(row.count)]),
    );
  }

  completeHealthCheck(record: HealthCheckRecord): {
    shouldPublish: boolean;
    consecutiveFailures: number;
    redirectConfirmations: number;
  } {
    const current = this.sqlite
      .query(
        `SELECT consecutive_failures, last_health_publish_at,
                last_health_fingerprint, redirect_candidate,
                redirect_confirmations
         FROM stations WHERE address = ?`,
      )
      .get(record.stationAddress) as
      | {
          consecutive_failures: number;
          last_health_publish_at: number | null;
          last_health_fingerprint: string | null;
          redirect_candidate: string | null;
          redirect_confirmations: number;
        }
      | null;

    const failures = record.reachable
      ? 0
      : asNumber(current?.consecutive_failures) + 1;
    const fingerprint = `${record.status}:${record.score}:${record.insecure ? 1 : 0}`;
    const shouldPublish =
      current?.last_health_fingerprint !== fingerprint ||
      !current?.last_health_publish_at ||
      record.checkedAt - current.last_health_publish_at >= DAY_SECONDS;

    const redirectCandidate =
      record.reachable && record.resolvedUrl && record.resolvedUrl !== record.streamUrl
        ? record.resolvedUrl
        : null;
    const redirectConfirmations = redirectCandidate
      ? current?.redirect_candidate === redirectCandidate
        ? asNumber(current.redirect_confirmations) + 1
        : 1
      : 0;

    const transaction = this.sqlite.transaction(() => {
      this.sqlite
        .query(
          `INSERT INTO health_checks(
             station_address, checked_at, reachable, status, score, latency_ms,
             stream_url, resolved_url, content_type, insecure, evidence_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.stationAddress,
          record.checkedAt,
          record.reachable ? 1 : 0,
          record.status,
          record.score,
          record.latencyMs ?? null,
          record.streamUrl ?? null,
          record.resolvedUrl ?? null,
          record.contentType ?? null,
          record.insecure ? 1 : 0,
          JSON.stringify(record.evidence),
        );
      this.sqlite
        .query(
          `UPDATE stations SET
             last_checked_at = ?, next_check_at = ?, consecutive_failures = ?,
             status = ?, score = ?,
             last_health_publish_at = CASE WHEN ? THEN ? ELSE last_health_publish_at END,
             last_health_fingerprint = CASE WHEN ? THEN ? ELSE last_health_fingerprint END,
             redirect_candidate = ?, redirect_confirmations = ?
           WHERE address = ?`,
        )
        .run(
          record.checkedAt,
          record.checkedAt + DAY_SECONDS,
          failures,
          record.status,
          record.score,
          shouldPublish ? 1 : 0,
          record.checkedAt,
          shouldPublish ? 1 : 0,
          fingerprint,
          redirectCandidate,
          redirectConfirmations,
          record.stationAddress,
        );
    });
    transaction();

    return { shouldPublish, consecutiveFailures: failures, redirectConfirmations };
  }

  recordHeartbeat(input: {
    sessionId: string;
    stationAddress: string;
    streamUrl: string;
    observedAt: number;
    metadata: StreamMetadata;
  }): { track: StationTrack | null; shouldPublishTrack: boolean } {
    const observedAt = input.observedAt;
    const previousSession = this.sqlite
      .query(
        `SELECT station_address, stream_url, last_seen_at
         FROM listening_sessions WHERE session_id = ?`,
      )
      .get(input.sessionId) as
      | { station_address: string; stream_url: string; last_seen_at: number }
      | null;
    const samePlayback =
      previousSession?.station_address === input.stationAddress &&
      previousSession.stream_url === input.streamUrl;
    const creditedSeconds = samePlayback
      ? Math.max(
          0,
          Math.min(
            MAX_HEARTBEAT_CREDIT_SECONDS,
            observedAt - asNumber(previousSession.last_seen_at),
          ),
        )
      : 0;
    const heartbeatTransaction = this.sqlite.transaction(() => {
      this.sqlite
        .query(
          `INSERT INTO listening_sessions(
             session_id, station_address, stream_url, started_at, last_seen_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(session_id) DO UPDATE SET
             station_address = excluded.station_address,
             stream_url = excluded.stream_url,
             started_at = CASE
               WHEN listening_sessions.station_address != excluded.station_address
                 OR listening_sessions.stream_url != excluded.stream_url
               THEN excluded.started_at
               ELSE listening_sessions.started_at
             END,
             last_seen_at = MAX(listening_sessions.last_seen_at, excluded.last_seen_at),
             heartbeat_count = listening_sessions.heartbeat_count + 1`,
        )
        .run(
          input.sessionId,
          input.stationAddress,
          input.streamUrl,
          observedAt,
          observedAt,
        );
      this.sqlite
        .query(
          `INSERT OR IGNORE INTO listening_heartbeats(
             session_id, station_address, observed_at, credited_seconds
           ) VALUES (?, ?, ?, ?)`,
        )
        .run(
          input.sessionId,
          input.stationAddress,
          observedAt,
          creditedSeconds,
        );
    });
    heartbeatTransaction();

    const track: StationTrack = {
      stationAddress: input.stationAddress,
      observedAt,
      artist: input.metadata.artist || input.metadata.enriched?.artist,
      song:
        input.metadata.song ||
        input.metadata.enriched?.title ||
        input.metadata.title,
      title: input.metadata.title,
      album: input.metadata.enriched?.album,
      mbid: input.metadata.enriched?.mbid,
      source: input.metadata.source,
    };
    const trackKey = semanticTrackKey(track);
    if (!trackKey) return { track: null, shouldPublishTrack: false };

    const current = this.sqlite
      .query(
        `SELECT id, track_key FROM track_segments
         WHERE station_address = ?
         ORDER BY last_seen_at DESC LIMIT 1`,
      )
      .get(input.stationAddress) as { id: number; track_key: string } | null;
    if (current?.track_key === trackKey) {
      this.sqlite
        .query(
          `UPDATE track_segments SET last_seen_at = ?, heartbeat_count = heartbeat_count + 1
           WHERE id = ?`,
        )
        .run(observedAt, current.id);
    } else {
      this.sqlite
        .query(
          `INSERT INTO track_segments(
             station_address, track_key, artist, title, album, mbid, source,
             started_at, last_seen_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.stationAddress,
          trackKey,
          track.artist ?? null,
          track.song ?? track.title ?? null,
          track.album ?? null,
          track.mbid ?? null,
          track.source ?? null,
          observedAt,
          observedAt,
        );
    }

    const published = this.sqlite
      .query(
        "SELECT track_key, published_at FROM published_tracks WHERE station_address = ?",
      )
      .get(input.stationAddress) as { track_key: string; published_at: number } | null;
    const shouldPublishTrack =
      published?.track_key !== trackKey ||
      !published?.published_at ||
      observedAt - published.published_at >= 2 * 60;
    if (shouldPublishTrack) {
      this.sqlite
        .query(
          `INSERT INTO published_tracks(station_address, track_key, published_at)
           VALUES (?, ?, ?)
           ON CONFLICT(station_address) DO UPDATE SET
             track_key = excluded.track_key,
             published_at = excluded.published_at`,
        )
        .run(input.stationAddress, trackKey, observedAt);
    }

    return { track, shouldPublishTrack };
  }

  ingestSocialEvent(event: NostrEvent): boolean {
    const stationAddress = event.tags.find(
      ([name, value]) => name === "a" && value?.startsWith(`${STATION_KIND}:`),
    )?.[1];
    if (!stationAddress) return false;
    const metric = event.kind === 7 ? "like" : event.kind === 9735 || event.kind === 9321 ? "zap" : null;
    if (!metric) return false;
    const result = this.sqlite
      .query(
        `INSERT OR IGNORE INTO social_events(
           event_id, station_address, metric, actor_pubkey, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.id, stationAddress, metric, event.pubkey, event.created_at);
    return result.changes > 0;
  }

  ingestReport(event: NostrEvent): boolean {
    if (event.kind !== 1985) return false;
    const stationAddress = event.tags.find(
      ([name, value]) => name === "a" && value?.startsWith(`${STATION_KIND}:`),
    )?.[1];
    const label = event.tags.find(
      ([name, , namespace]) =>
        name === "l" && namespace === "wavefunc.station-status",
    )?.[1] as StationReportLabel | undefined;
    if (!stationAddress || !label) return false;
    const result = this.sqlite
      .query(
        `INSERT OR IGNORE INTO station_reports(
           event_id, station_address, label, reporter_pubkey, created_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.id, stationAddress, label, event.pubkey, event.created_at);
    return result.changes > 0;
  }

  ranking(metric: "like" | "zap", since: number, limit: number): StationRankingEntry[] {
    const distinct = metric === "like" ? "actor_pubkey" : "event_id";
    const rows = this.sqlite
      .query(
        `SELECT station_address, COUNT(DISTINCT ${distinct}) AS value
         FROM social_events
         WHERE metric = ? AND created_at >= ?
         GROUP BY station_address
         ORDER BY value DESC
         LIMIT ?`,
      )
      .all(metric, since, limit) as RankingRow[];
    return rows.map((row) => ({
      stationAddress: row.station_address,
      value: asNumber(row.value),
    }));
  }

  bestSignal(since: number, limit: number): StationRankingEntry[] {
    const rows = this.sqlite
      .query(
        `SELECT address AS station_address, score AS value
         FROM stations
         WHERE last_checked_at >= ? AND status IN ('up', 'degraded')
         ORDER BY score DESC, last_checked_at DESC
         LIMIT ?`,
      )
      .all(since, limit) as RankingRow[];
    return rows.map((row) => ({
      stationAddress: row.station_address,
      value: asNumber(row.value),
      label: "SIGNAL_SCORE",
    }));
  }

  mostListened(since: number, now: number, limit: number): StationRankingEntry[] {
    const rows = this.sqlite
      .query(
        `SELECT station_address,
                SUM(credited_seconds) / 60.0 AS value
         FROM listening_heartbeats
         WHERE observed_at >= ? AND observed_at <= ?
         GROUP BY station_address
         HAVING value > 0
         ORDER BY value DESC
         LIMIT ?`,
      )
      .all(since, now, limit) as RankingRow[];
    return rows.map((row) => ({
      stationAddress: row.station_address,
      value: Math.round(asNumber(row.value) * 10) / 10,
      label: "LISTENER_MIN",
    }));
  }

  hasNowPlaying(since: number, limit: number): StationRankingEntry[] {
    const rows = this.sqlite
      .query(
        `SELECT station_address, COUNT(*) AS value,
                MAX(last_seen_at) AS last_seen_at
         FROM track_segments
         WHERE last_seen_at >= ?
         GROUP BY station_address
         ORDER BY last_seen_at DESC, value DESC
         LIMIT ?`,
      )
      .all(since, limit) as NowPlayingCoverageRow[];
    return rows.map((row) => ({
      stationAddress: row.station_address,
      value: asNumber(row.value),
      label: "TRACKS_OBSERVED",
      observedAt: asNumber(row.last_seen_at),
    }));
  }

  onAirNow(since: number, limit: number): StationRankingEntry[] {
    const rows = this.sqlite
      .query(
        `SELECT station_address, artist, title, MAX(last_seen_at) AS last_seen_at
         FROM track_segments
         WHERE last_seen_at >= ?
         GROUP BY station_address
         ORDER BY last_seen_at DESC
         LIMIT ?`,
      )
      .all(since, limit) as TrackRow[];
    return rows.map((row) => ({
      stationAddress: row.station_address,
      value: 1,
      artist: row.artist ?? undefined,
      title: row.title ?? undefined,
      observedAt: asNumber(row.last_seen_at),
    }));
  }
}
