import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import { RelayPool } from "applesauce-relay";
import { PrivateKeySigner } from "applesauce-signers";
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "nostr-tools/utils";
import type { Subscription } from "rxjs";

import {
  STATION_KIND,
  buildStationHealthTemplate,
  buildStationRankingTemplate,
  buildStationTemplate,
  buildStationTrackTemplate,
  calculateStationHealthScore,
  parseStationEvent,
  type StationRankingMetric,
  type StationRankingSnapshot,
} from "../../src/lib/nostr/domain";
import type { EventTemplate } from "../../src/lib/nostr/types";
import { createRelayPolicy } from "../../src/config/relayPolicy";
import type { StreamMetadata } from "../schemas";
import { ObserverDatabase, type ObserverStation } from "./database";
import { probeStreamHealth, type StreamProbeResult } from "./probe";

const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;

export type StationObserverOptions = {
  appRelay: string;
  observerPrivateKey: string;
  catalogPrivateKey?: string;
  catalogPubkey?: string;
  databasePath?: string;
  batchSize?: number;
  concurrency?: number;
  autoUpdateCatalog?: boolean;
  now?: () => number;
};

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function ensureDatabaseDirectory(path: string) {
  if (path === ":memory:") return;
  const directory = dirname(path);
  if (directory && directory !== ".") mkdirSync(directory, { recursive: true });
}

function runBounded<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, values.length)) },
    async () => {
      while (cursor < values.length) {
        const value = values[cursor];
        cursor += 1;
        if (value !== undefined) await task(value);
      }
    },
  );
  return Promise.all(workers).then(() => undefined);
}

export class StationObserver {
  readonly database: ObserverDatabase;
  readonly observerPubkey: Promise<string>;

  private readonly pool = new RelayPool();
  private readonly observerSigner: PrivateKeySigner;
  private readonly catalogSigner?: PrivateKeySigner;
  private readonly catalogPubkey?: string;
  private readonly now: () => number;
  private readonly subscriptions: Subscription[] = [];
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private healthBatchRunning = false;
  private rankingPublishRunning = false;

  constructor(private readonly options: StationObserverOptions) {
    const databasePath = options.databasePath ?? "data/observer.sqlite";
    ensureDatabaseDirectory(databasePath);
    this.database = new ObserverDatabase(databasePath);
    this.observerSigner = PrivateKeySigner.fromKey(options.observerPrivateKey);
    this.observerPubkey = this.observerSigner.getPublicKey();
    this.catalogSigner = options.catalogPrivateKey
      ? PrivateKeySigner.fromKey(options.catalogPrivateKey)
      : undefined;
    this.catalogPubkey =
      options.catalogPubkey ??
      (options.catalogPrivateKey
        ? getPublicKey(hexToBytes(options.catalogPrivateKey))
        : undefined);
    this.now = options.now ?? unixNow;
    this.pool.relay(options.appRelay);
  }

  async start() {
    console.log(
      `📊 Station observer using ${this.options.appRelay} (${this.database.stationCount} cached stations)`,
    );
    if (!this.catalogPubkey) {
      console.warn(
        "⚠️ Station observer catalog sync disabled: set APP_PRIVATE_KEY or CATALOG_PUBKEY",
      );
    } else {
      await this.syncCatalog();
      this.subscribeCatalog();
    }
    await this.syncEvidence();
    this.subscribeEvidence();
    await this.publishRankings();
    this.runBackground("health batch", () => this.runHealthBatch());

    this.timers.push(
      setInterval(
        () => this.runBackground("health batch", () => this.runHealthBatch()),
        60_000,
      ),
      setInterval(
        () => this.runBackground("evidence sync", () => this.syncEvidence()),
        15 * 60_000,
      ),
      setInterval(
        () => this.runBackground("ranking publish", () => this.publishRankings()),
        60 * 60_000,
      ),
    );
  }

  private runBackground(label: string, task: () => Promise<void>) {
    void task().catch((error) => {
      console.warn(`Station observer ${label} failed:`, error);
    });
  }

  stop() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.subscriptions.length = 0;
    this.pool.close();
    this.database.close();
  }

  private async publish(template: EventTemplate, signer = this.observerSigner) {
    const event = await signer.signEvent({
      ...template,
      created_at: template.created_at ?? this.now(),
    });
    const responses = await this.pool.publish([this.options.appRelay], event);
    if (!responses.some((response) => response.ok)) {
      throw new Error(
        responses
          .map((response) => `${response.from}: ${response.message ?? "rejected"}`)
          .join("; ") || "Observer event was rejected",
      );
    }
    return event;
  }

  private request(filters: Filter[], onEvent: (event: NostrEvent) => void) {
    return new Promise<void>((resolve, reject) => {
      this.pool.request([this.options.appRelay], filters).subscribe({
        next: onEvent,
        complete: resolve,
        error: reject,
      });
    });
  }

  private ingestCatalogEvent = (event: NostrEvent) => {
    if (event.kind !== STATION_KIND || event.pubkey !== this.catalogPubkey) return;
    const station = parseStationEvent(event, [this.options.appRelay]);
    this.database.upsertStation(station, this.now());
  };

  private async syncCatalog() {
    if (!this.catalogPubkey) return;
    const lastSync = Number(this.database.getMeta("catalog_last_sync") ?? 0);
    const filters: Filter[] = [
      {
        kinds: [STATION_KIND],
        authors: [this.catalogPubkey],
        ...(this.database.stationCount > 0 && lastSync > 0
          ? { since: Math.max(0, lastSync - 60) }
          : {}),
      },
    ];
    await this.request(filters, this.ingestCatalogEvent);
    this.database.setMeta("catalog_last_sync", String(this.now()));
    console.log(`📻 Observer registry contains ${this.database.stationCount} stations`);
  }

  private subscribeCatalog() {
    if (!this.catalogPubkey) return;
    this.subscriptions.push(
      this.pool
        .subscription([this.options.appRelay], [
          { kinds: [STATION_KIND], authors: [this.catalogPubkey] },
        ])
        .subscribe({ next: this.ingestCatalogEvent }),
    );
  }

  private ingestEvidenceEvent = (event: NostrEvent) => {
    this.database.ingestSocialEvent(event);
    this.database.ingestReport(event);
  };

  private async syncEvidence() {
    const lastSync = Number(this.database.getMeta("evidence_last_sync") ?? 0);
    await this.request(
      [
        {
          kinds: [7, 9735, 9321, 1985],
          ...(lastSync > 0 ? { since: Math.max(0, lastSync - 60) } : {}),
        },
      ],
      this.ingestEvidenceEvent,
    );
    this.database.setMeta("evidence_last_sync", String(this.now()));
  }

  private subscribeEvidence() {
    this.subscriptions.push(
      this.pool
        .subscription([this.options.appRelay], [
          { kinds: [7, 9735, 9321, 1985] },
        ])
        .subscribe({ next: this.ingestEvidenceEvent }),
    );
  }

  private async probeStation(station: ObserverStation) {
    const checkedAt = this.now();
    let result: StreamProbeResult | null = null;
    for (const streamUrl of station.streamUrls) {
      result = await probeStreamHealth(streamUrl);
      if (result.reachable) break;
    }
    if (!result) return;

    const failures = result.reachable ? 0 : station.consecutiveFailures + 1;
    const reports = this.database.reportCounts(
      station.address,
      checkedAt - WEEK_SECONDS,
    );
    const calculated = calculateStationHealthScore({
      reachable: result.reachable,
      consecutiveFailures: failures,
      insecure: result.insecure,
      reports,
    });
    const completion = this.database.completeHealthCheck({
      stationAddress: station.address,
      checkedAt,
      reachable: result.reachable,
      status: calculated.status,
      score: calculated.score,
      latencyMs: result.latencyMs,
      streamUrl: result.streamUrl,
      resolvedUrl: result.resolvedUrl,
      contentType: result.contentType,
      insecure: result.insecure,
      evidence: [
        ...calculated.evidence,
        ...(result.error ? [result.error] : []),
      ],
    });

    if (completion.shouldPublish) {
      await this.publish(
        buildStationHealthTemplate({
          stationAddress: station.address,
          checkedAt,
          status: calculated.status,
          score: calculated.score,
          latencyMs: result.latencyMs,
          consecutiveFailures: completion.consecutiveFailures,
          streamUrl: result.streamUrl,
          resolvedUrl: result.resolvedUrl,
          contentType: result.contentType,
          insecure: result.insecure,
          evidence: calculated.evidence,
        }),
      );
    }

    if (
      result.reachable &&
      result.permanentRedirect &&
      completion.redirectConfirmations >= 3
    ) {
      await this.updatePermanentRedirect(station, result);
    }
  }

  async runHealthBatch() {
    if (this.healthBatchRunning) return;
    this.healthBatchRunning = true;
    try {
      const stations = this.database.dueStations(
        this.now(),
        this.options.batchSize ?? 40,
      );
      await runBounded(stations, this.options.concurrency ?? 8, async (station) => {
        try {
          await this.probeStation(station);
        } catch (error) {
          console.warn(`Health check failed for ${station.address}:`, error);
        }
      });
    } finally {
      this.healthBatchRunning = false;
    }
  }

  private async updatePermanentRedirect(
    stationRecord: ObserverStation,
    result: StreamProbeResult,
  ) {
    if (
      !this.options.autoUpdateCatalog ||
      !this.catalogSigner ||
      !result.resolvedUrl ||
      result.resolvedUrl === result.streamUrl
    ) {
      return;
    }
    const station = parseStationEvent(stationRecord.event, [this.options.appRelay]);
    if (!station.stationId || !station.name || station.streams.length === 0) return;
    const streams = station.streams.map((stream) =>
      stream.url === result.streamUrl
        ? { ...stream, url: result.resolvedUrl! }
        : stream,
    );
    await this.publish(
      buildStationTemplate({
        stationId: station.stationId,
        name: station.name,
        description: station.description ?? station.name,
        thumbnail: station.thumbnail,
        website: station.website,
        location: station.location,
        countryCode: station.countryCode,
        genres: station.genres,
        languages: station.languages,
        streams,
        streamingServerUrl: station.streamingServerUrl,
      }),
      this.catalogSigner,
    );
    console.log(`🔁 Updated permanent redirect for ${station.address}`);
  }

  async observeMetadata(input: {
    stationAddress?: string;
    sessionId?: string;
    streamUrl: string;
    observedAt?: number;
    metadata: StreamMetadata;
  }) {
    if (!input.stationAddress || !input.sessionId) return;
    if (!this.database.isKnownStationStream(input.stationAddress, input.streamUrl)) {
      return;
    }
    const serverNow = this.now();
    const observedAt =
      input.observedAt !== undefined && Math.abs(input.observedAt - serverNow) <= 2 * 60
        ? input.observedAt
        : serverNow;
    const result = this.database.recordHeartbeat({
      sessionId: input.sessionId,
      stationAddress: input.stationAddress,
      streamUrl: input.streamUrl,
      observedAt,
      metadata: input.metadata,
    });
    if (result.track && result.shouldPublishTrack) {
      await this.publish(buildStationTrackTemplate(result.track));
    }
  }

  async publishRankings() {
    if (this.rankingPublishRunning) return;
    this.rankingPublishRunning = true;
    try {
      const now = this.now();
      const snapshots: Array<{
        metric: StationRankingMetric;
        window: string;
        entries: StationRankingSnapshot["entries"];
      }> = [
        {
          metric: "best-signal",
          window: "latest",
          entries: this.database.bestSignal(now - 36 * 60 * 60, 12),
        },
        {
          metric: "has-now-playing",
          window: "24h",
          entries: this.database.hasNowPlaying(now - DAY_SECONDS, 12),
        },
        {
          metric: "most-listened",
          window: "24h",
          entries: this.database.mostListened(now - DAY_SECONDS, now, 12),
        },
        {
          metric: "most-liked",
          window: "7d",
          entries: this.database.ranking("like", now - WEEK_SECONDS, 12),
        },
        {
          metric: "most-zapped",
          window: "7d",
          entries: this.database.ranking("zap", now - WEEK_SECONDS, 12),
        },
        {
          metric: "on-air-now",
          window: "2m",
          entries: this.database.onAirNow(now - 2 * 60, 12),
        },
      ];

      for (const snapshot of snapshots) {
        await this.publish(
          buildStationRankingTemplate({
            ...snapshot,
            generatedAt: now,
          }),
        );
      }
    } finally {
      this.rankingPublishRunning = false;
    }
  }
}

export function createStationObserverFromEnvironment(input: {
  appRelay: string;
  observerPrivateKey: string;
}) {
  const stage =
    process.env.APP_STAGE === "production" ||
    (process.env.APP_STAGE !== "development" && process.env.NODE_ENV === "production")
      ? "production"
      : "development";
  // Reuse the client policy's fail-closed local/public boundary. The observer
  // must never turn a dev relay into a bridge to production app data.
  createRelayPolicy({ stage, appRelay: input.appRelay });
  const configuredBatchSize = Number(process.env.HEALTH_BATCH_SIZE || 40);
  const configuredConcurrency = Number(process.env.HEALTH_CONCURRENCY || 8);
  return new StationObserver({
    appRelay: input.appRelay,
    observerPrivateKey: input.observerPrivateKey,
    catalogPrivateKey: process.env.APP_PRIVATE_KEY,
    catalogPubkey: process.env.CATALOG_PUBKEY,
    databasePath: process.env.OBSERVER_DB_PATH || "data/observer.sqlite",
    batchSize: Number.isFinite(configuredBatchSize)
      ? Math.max(1, Math.min(500, Math.trunc(configuredBatchSize)))
      : 40,
    concurrency: Number.isFinite(configuredConcurrency)
      ? Math.max(1, Math.min(32, Math.trunc(configuredConcurrency)))
      : 8,
    autoUpdateCatalog: process.env.STATION_AUTO_UPDATE === "true",
  });
}
