import { afterEach, describe, expect, test } from "bun:test";
import type { NostrEvent } from "applesauce-core/helpers/event";

import { ObserverDatabase } from "../contextvm/observer/database";
import {
  buildStationHealthTemplate,
  buildStationRankingTemplate,
  buildStationReportTemplate,
  buildStationTrackTemplate,
  calculateStationHealthScore,
  parseStationEvent,
  parseStationHealthEvent,
  parseStationRankingEvent,
  parseStationTrackEvent,
} from "../src/lib/nostr/domain";

const stationPubkey = "a".repeat(64);
const stationAddress = `31237:${stationPubkey}:station-1`;

function eventFromTemplate(
  template: { kind: number; content: string; tags: string[][] },
  overrides: Partial<NostrEvent> = {},
): NostrEvent {
  return {
    id: "b".repeat(64),
    pubkey: "c".repeat(64),
    sig: "d".repeat(128),
    created_at: 1_700_000_000,
    ...template,
    ...overrides,
  };
}

function stationEvent(): NostrEvent {
  return {
    id: "1".repeat(64),
    pubkey: stationPubkey,
    sig: "2".repeat(128),
    kind: 31237,
    created_at: 1_700_000_000,
    content: JSON.stringify({
      description: "Test station",
      streams: [
        {
          url: "https://radio.example/live.mp3",
          format: "audio/mpeg",
          quality: { bitrate: 128, codec: "mp3", sampleRate: 44100 },
          primary: true,
        },
      ],
    }),
    tags: [
      ["d", "station-1"],
      ["name", "Test Station"],
      ["description", "Test station"],
      [
        "stream",
        "https://radio.example/live.mp3",
        "audio/mpeg",
        JSON.stringify({ bitrate: 128, codec: "mp3", sampleRate: 44100 }),
        "primary",
      ],
    ],
  };
}

describe("station observation event contracts", () => {
  test("round-trips health, track, and ranking snapshots", () => {
    const health = buildStationHealthTemplate({
      stationAddress,
      status: "up",
      score: 95,
      checkedAt: 1_700_000_000,
      latencyMs: 120,
      consecutiveFailures: 0,
      streamUrl: "https://radio.example/live.mp3",
      insecure: false,
      evidence: [],
    });
    expect(parseStationHealthEvent(eventFromTemplate(health), 1_700_000_010)).toMatchObject({
      stationAddress,
      status: "up",
      score: 95,
    });
    expect(parseStationHealthEvent(eventFromTemplate(health), 1_700_129_601)).toBeNull();

    const track = buildStationTrackTemplate({
      stationAddress,
      observedAt: 1_700_000_000,
      artist: "Artist",
      song: "Track",
    });
    const trackEvent = eventFromTemplate(track);
    expect(parseStationTrackEvent(trackEvent, 1_700_000_010)).toMatchObject({
      artist: "Artist",
      song: "Track",
    });
    expect(parseStationTrackEvent(trackEvent, 1_700_000_181)).toBeNull();

    const ranking = buildStationRankingTemplate({
      metric: "most-liked",
      window: "7d",
      generatedAt: 1_700_000_000,
      entries: [{ stationAddress, value: 4 }],
    });
    expect(parseStationRankingEvent(eventFromTemplate(ranking), 1_700_000_010)).toMatchObject({
      metric: "most-liked",
      entries: [{ stationAddress, value: 4 }],
    });
    expect(parseStationRankingEvent(eventFromTemplate(ranking), 1_700_007_201)).toBeNull();
  });

  test("rejects mismatched targets and builds namespaced NIP-32 reports", () => {
    const health = buildStationHealthTemplate({
      stationAddress,
      status: "up",
      score: 100,
      checkedAt: 1,
      consecutiveFailures: 0,
      insecure: false,
      evidence: [],
    });
    const mismatched = eventFromTemplate({
      ...health,
      tags: health.tags.map((tag) =>
        tag[0] === "a" ? ["a", `${stationAddress}-wrong`] : tag,
      ),
    });
    expect(parseStationHealthEvent(mismatched)).toBeNull();

    const report = buildStationReportTemplate({
      stationAddress,
      stationPubkey,
      label: "down",
      note: "No audio on two networks",
    });
    expect(report.kind).toBe(1985);
    expect(report.tags).toContainEqual([
      "l",
      "down",
      "wavefunc.station-status",
    ]);
    expect(report.tags).toContainEqual(["a", stationAddress]);
  });

  test("keeps community influence capped and automated reachability dominant", () => {
    expect(
      calculateStationHealthScore({
        reachable: true,
        consecutiveFailures: 0,
        insecure: true,
        reports: { down: 100 },
      }),
    ).toMatchObject({ score: 75, status: "up" });
    expect(
      calculateStationHealthScore({
        reachable: false,
        consecutiveFailures: 2,
        reports: { up: 100 },
        insecure: false,
      }),
    ).toMatchObject({ score: 45, status: "down" });
  });
});

describe("observer aggregation database", () => {
  const databases: ObserverDatabase[] = [];
  afterEach(() => {
    while (databases.length) databases.pop()?.close();
  });

  test("derives listener-minutes, unique likes, zaps, and track changes", () => {
    const database = new ObserverDatabase(":memory:");
    databases.push(database);
    database.upsertStation(parseStationEvent(stationEvent()), 1_700_000_000);
    database.completeHealthCheck({
      stationAddress,
      checkedAt: 1_700_000_000,
      reachable: true,
      status: "up",
      score: 96,
      streamUrl: "https://radio.example/live.mp3",
      insecure: false,
      evidence: ["http:200"],
    });
    expect(database.bestSignal(1_699_999_000, 10)[0]).toMatchObject({
      stationAddress,
      value: 96,
      label: "SIGNAL_SCORE",
    });
    expect(database.isKnownStationStream(stationAddress, "https://radio.example/live.mp3")).toBe(true);
    expect(database.isKnownStationStream(stationAddress, "https://attacker.example/live")).toBe(false);

    const first = database.recordHeartbeat({
      sessionId: "anonymous-session-1",
      stationAddress,
      streamUrl: "https://radio.example/live.mp3",
      observedAt: 1_700_000_000,
      metadata: { artist: "Artist", song: "Track", source: "ICY" },
    });
    const repeated = database.recordHeartbeat({
      sessionId: "anonymous-session-1",
      stationAddress,
      streamUrl: "https://radio.example/live.mp3",
      observedAt: 1_700_000_060,
      metadata: { artist: "Artist", song: "Track", source: "ICY" },
    });
    expect(first.shouldPublishTrack).toBe(true);
    expect(repeated.shouldPublishTrack).toBe(false);
    expect(database.hasNowPlaying(1_699_999_000, 10)[0]).toMatchObject({
      stationAddress,
      value: 1,
      label: "TRACKS_OBSERVED",
      observedAt: 1_700_000_060,
    });
    expect(
      database.mostListened(1_699_999_000, 1_700_000_060, 10)[0],
    ).toMatchObject({ stationAddress, value: 1 });

    database.recordHeartbeat({
      sessionId: "anonymous-session-1",
      stationAddress,
      streamUrl: "https://radio.example/live.mp3",
      observedAt: 1_700_003_660,
      metadata: { artist: "Artist", song: "Track", source: "ICY" },
    });
    expect(
      database.mostListened(1_699_999_000, 1_700_003_660, 10)[0],
    ).toMatchObject({ stationAddress, value: 2 });

    database.ingestSocialEvent(
      eventFromTemplate(
        { kind: 7, content: "+", tags: [["a", stationAddress]] },
        { id: "3".repeat(64), pubkey: "e".repeat(64) },
      ),
    );
    database.ingestSocialEvent(
      eventFromTemplate(
        { kind: 7, content: "+", tags: [["a", stationAddress]] },
        { id: "4".repeat(64), pubkey: "e".repeat(64) },
      ),
    );
    database.ingestSocialEvent(
      eventFromTemplate(
        { kind: 9735, content: "", tags: [["a", stationAddress]] },
        { id: "5".repeat(64) },
      ),
    );
    database.ingestSocialEvent(
      eventFromTemplate(
        { kind: 9321, content: "", tags: [["a", stationAddress]] },
        { id: "6".repeat(64) },
      ),
    );

    expect(database.ranking("like", 1_699_999_000, 10)[0]).toMatchObject({
      stationAddress,
      value: 1,
    });
    expect(database.ranking("zap", 1_699_999_000, 10)[0]).toMatchObject({
      stationAddress,
      value: 2,
    });
  });
});
