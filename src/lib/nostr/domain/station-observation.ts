import type { NostrEvent } from "applesauce-core/helpers/event";
import { z } from "zod";

import type { EventTemplate } from "../types";
import { getFirstTagValue, parseJsonContent } from "./shared";
import { STATION_KIND } from "./station";

export const STATION_HEALTH_KIND = 31238;
export const STATION_NOW_PLAYING_KIND = 31239;
export const STATION_RANKING_KIND = 31240;
export const STATION_REPORT_KIND = 1985;
export const STATION_REPORT_NAMESPACE = "wavefunc.station-status";

export const StationHealthStatusSchema = z.enum([
  "up",
  "degraded",
  "down",
  "unknown",
]);
export type StationHealthStatus = z.infer<typeof StationHealthStatusSchema>;

const StationAddressSchema = z
  .string()
  .refine((value) => value.startsWith(`${STATION_KIND}:`), {
    message: "Expected a kind 31237 station address",
  });

export const StationHealthSummarySchema = z.object({
  stationAddress: StationAddressSchema,
  status: StationHealthStatusSchema,
  score: z.number().min(0).max(100),
  checkedAt: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative().optional(),
  consecutiveFailures: z.number().int().nonnegative(),
  streamUrl: z.string().url().optional(),
  resolvedUrl: z.string().url().optional(),
  contentType: z.string().optional(),
  insecure: z.boolean(),
  evidence: z.array(z.string()).default([]),
});
export type StationHealthSummary = z.infer<typeof StationHealthSummarySchema>;

export const StationTrackSchema = z.object({
  stationAddress: StationAddressSchema,
  observedAt: z.number().int().nonnegative(),
  title: z.string().min(1).optional(),
  artist: z.string().min(1).optional(),
  song: z.string().min(1).optional(),
  album: z.string().min(1).optional(),
  mbid: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});
export type StationTrack = z.infer<typeof StationTrackSchema>;

export const StationRankingMetricSchema = z.enum([
  "best-signal",
  "has-now-playing",
  "most-listened",
  "most-liked",
  "most-zapped",
  "on-air-now",
]);
export type StationRankingMetric = z.infer<typeof StationRankingMetricSchema>;

export const StationRankingEntrySchema = z.object({
  stationAddress: StationAddressSchema,
  value: z.number().nonnegative(),
  label: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
  observedAt: z.number().int().nonnegative().optional(),
});
export type StationRankingEntry = z.infer<typeof StationRankingEntrySchema>;

export const StationRankingSnapshotSchema = z.object({
  metric: StationRankingMetricSchema,
  window: z.string().min(1),
  generatedAt: z.number().int().nonnegative(),
  entries: z.array(StationRankingEntrySchema).max(50),
});
export type StationRankingSnapshot = z.infer<
  typeof StationRankingSnapshotSchema
>;

export const StationReportLabelSchema = z.enum([
  "down",
  "up",
  "ads",
  "adfree",
  "http-insecure",
  "metadata-wrong",
  "duplicate",
]);
export type StationReportLabel = z.infer<typeof StationReportLabelSchema>;

function parseAddressableContent<T>(
  event: NostrEvent,
  kind: number,
  schema: z.ZodType<T>,
): T | null {
  if (event.kind !== kind) return null;
  const target = getFirstTagValue(event, "a");
  const identifier = getFirstTagValue(event, "d");
  if (!target || identifier !== target) return null;
  const parsed = schema.safeParse(parseJsonContent<unknown>(event.content));
  if (!parsed.success) return null;
  const value = parsed.data as T & { stationAddress?: string };
  if (value.stationAddress && value.stationAddress !== target) return null;
  return parsed.data;
}

export function parseStationHealthEvent(
  event: NostrEvent,
  now = Math.floor(Date.now() / 1000),
): StationHealthSummary | null {
  const expiration = Number(getFirstTagValue(event, "expiration"));
  if (Number.isFinite(expiration) && expiration <= now) return null;
  return parseAddressableContent(
    event,
    STATION_HEALTH_KIND,
    StationHealthSummarySchema,
  );
}

export function parseStationTrackEvent(
  event: NostrEvent,
  now = Math.floor(Date.now() / 1000),
): StationTrack | null {
  const expiration = Number(getFirstTagValue(event, "expiration"));
  if (Number.isFinite(expiration) && expiration <= now) return null;
  return parseAddressableContent(
    event,
    STATION_NOW_PLAYING_KIND,
    StationTrackSchema,
  );
}

export function parseStationRankingEvent(
  event: NostrEvent,
  now = Math.floor(Date.now() / 1000),
): StationRankingSnapshot | null {
  if (event.kind !== STATION_RANKING_KIND) return null;
  const expiration = Number(getFirstTagValue(event, "expiration"));
  if (Number.isFinite(expiration) && expiration <= now) return null;
  const identifier = getFirstTagValue(event, "d");
  const parsed = StationRankingSnapshotSchema.safeParse(
    parseJsonContent<unknown>(event.content),
  );
  if (!parsed.success) return null;
  if (`${parsed.data.metric}:${parsed.data.window}` !== identifier) return null;
  return parsed.data;
}

export function buildStationHealthTemplate(
  summary: StationHealthSummary,
  expiresAt = summary.checkedAt + 36 * 60 * 60,
): EventTemplate {
  const value = StationHealthSummarySchema.parse(summary);
  return {
    kind: STATION_HEALTH_KIND,
    content: JSON.stringify(value),
    tags: [
      ["d", value.stationAddress],
      ["a", value.stationAddress],
      ["status", value.status],
      ["score", String(value.score)],
      ["checked", String(value.checkedAt)],
      ["expiration", String(expiresAt)],
      ["t", "wavefunc"],
    ],
  };
}

export function buildStationTrackTemplate(
  track: StationTrack,
  expiresAt = track.observedAt + 3 * 60,
): EventTemplate {
  const value = StationTrackSchema.parse(track);
  const tags: string[][] = [
    ["d", value.stationAddress],
    ["a", value.stationAddress],
    ["expiration", String(expiresAt)],
    ["t", "wavefunc"],
    ["t", "tunestr"],
  ];
  if (value.artist) tags.push(["artist", value.artist]);
  if (value.song ?? value.title) tags.push(["title", value.song ?? value.title!]);
  return {
    kind: STATION_NOW_PLAYING_KIND,
    content: JSON.stringify(value),
    tags,
  };
}

export function buildStationRankingTemplate(
  snapshot: StationRankingSnapshot,
  expiresAt = snapshot.generatedAt + 2 * 60 * 60,
): EventTemplate {
  const value = StationRankingSnapshotSchema.parse(snapshot);
  return {
    kind: STATION_RANKING_KIND,
    content: JSON.stringify(value),
    tags: [
      ["d", `${value.metric}:${value.window}`],
      ["metric", value.metric],
      ["window", value.window],
      ...value.entries.map((entry) => ["a", entry.stationAddress]),
      ["expiration", String(expiresAt)],
      ["t", "wavefunc"],
    ],
  };
}

export function buildStationReportTemplate(input: {
  stationAddress: string;
  stationPubkey: string;
  label: StationReportLabel;
  note?: string;
}): EventTemplate {
  const stationAddress = StationAddressSchema.parse(input.stationAddress);
  const label = StationReportLabelSchema.parse(input.label);
  return {
    kind: STATION_REPORT_KIND,
    content: input.note?.trim() ?? "",
    tags: [
      ["L", STATION_REPORT_NAMESPACE],
      ["l", label, STATION_REPORT_NAMESPACE],
      ["a", stationAddress],
      ["p", input.stationPubkey],
      ["k", String(STATION_KIND)],
      ["t", "wavefunc"],
    ],
  };
}

export function semanticTrackKey(track: Partial<StationTrack>): string | null {
  const artist = track.artist?.trim().toLocaleLowerCase() ?? "";
  const title = (track.song ?? track.title)?.trim().toLocaleLowerCase() ?? "";
  if (!artist && !title) return null;
  return `${artist}\u0000${title}`;
}

export function calculateStationHealthScore(input: {
  reachable: boolean;
  consecutiveFailures: number;
  insecure: boolean;
  reports?: Partial<Record<StationReportLabel, number>>;
}): { score: number; status: StationHealthStatus; evidence: string[] } {
  const evidence: string[] = [];
  let score = input.reachable
    ? 100
    : Math.max(0, 55 - Math.max(0, input.consecutiveFailures - 1) * 20);

  if (!input.reachable) evidence.push("scheduled-probe-failed");
  if (input.insecure) {
    score -= 10;
    evidence.push("http-insecure");
  }

  const reports = input.reports ?? {};
  const negative =
    (reports.down ?? 0) * 4 +
    (reports.ads ?? 0) * 2 +
    (reports["metadata-wrong"] ?? 0) * 2;
  const positive = (reports.up ?? 0) * 3 + (reports.adfree ?? 0);
  const communityAdjustment = Math.max(-15, Math.min(10, positive - negative));
  if (communityAdjustment !== 0) {
    evidence.push(
      communityAdjustment > 0
        ? "community-confirmed"
        : "community-reported",
    );
  }
  score = Math.max(0, Math.min(100, score + communityAdjustment));

  const status: StationHealthStatus = !input.reachable
    ? input.consecutiveFailures >= 2
      ? "down"
      : "degraded"
    : score < 70
      ? "degraded"
      : "up";

  return { score, status, evidence };
}
