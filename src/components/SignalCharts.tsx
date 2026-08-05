import { useMemo, useState } from "react";
import type { Filter } from "applesauce-core/helpers/filter";

import {
  parseSongEvent,
  SONG_KIND,
  type ParsedSong,
  type ParsedStation,
  type StationRankingEntry,
  type StationRankingMetric,
  type StationRankingSnapshot,
} from "../lib/nostr/domain";
import { cn } from "../lib/utils";
import { useStationRankings, useStationHealth } from "../lib/nostr/hooks/useStationObservations";
import { useAppDataTimeline } from "../lib/nostr/hooks/useRelayTimeline";
import { useStationsByAddresses } from "../lib/nostr/hooks/useStations";
import { getDefaultSelectedStream } from "../lib/player/adapters";
import { usePlayerStore } from "../stores/playerStore";
import { useUIStore } from "../stores/uiStore";
import { SectionHeader } from "./SectionHeader";
import { CrateSaveButton } from "./CrateSaveButton";
import { StationHealthBadge } from "./StationHealthBadge";

const CHARTS: Array<{
  metric: StationRankingMetric;
  title: string;
  signal: string;
}> = [
  { metric: "best-signal", title: "BEST_SIGNAL", signal: "VERIFIED_QUALITY" },
  { metric: "has-now-playing", title: "HAS_NOW_PLAYING", signal: "METADATA_24H" },
  { metric: "most-listened", title: "MOST_LISTENED", signal: "24H_SIGNAL" },
  { metric: "most-liked", title: "MOST_LIKED", signal: "7D_RESONANCE" },
  { metric: "most-zapped", title: "MOST_ZAPPED", signal: "7D_VOLTAGE" },
  { metric: "on-air-now", title: "ON_AIR_NOW", signal: "LIVE_METADATA" },
];

function metricLabel(metric: StationRankingMetric, entry: StationRankingEntry) {
  if (metric === "best-signal") return `${entry.value.toLocaleString()} SIGNAL_SCORE`;
  if (metric === "has-now-playing") {
    return `${entry.value.toLocaleString()} TRACKS_OBSERVED`;
  }
  if (metric === "most-listened") return `${entry.value.toLocaleString()} LISTENER_MIN`;
  if (metric === "most-liked") return `${entry.value.toLocaleString()} LIKES`;
  if (metric === "most-zapped") return `${entry.value.toLocaleString()} ZAPS`;
  return [entry.artist, entry.title].filter(Boolean).join(" — ") || "SIGNAL_DETECTED";
}

function ChartThumbnail({ station }: { station: ParsedStation }) {
  const [failed, setFailed] = useState(false);
  if (station.thumbnail && !failed) {
    return (
      <img
        src={station.thumbnail}
        alt=""
        className="size-full object-cover grayscale transition group-hover:grayscale-0"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="material-symbols-outlined text-2xl text-white/20">
      radio
    </span>
  );
}

function ChartItem({
  station,
  entry,
  metric,
  rank,
  health,
}: {
  station: ParsedStation;
  entry: StationRankingEntry;
  metric: StationRankingMetric;
  rank: number;
  health?: Parameters<typeof StationHealthBadge>[0]["health"];
}) {
  const playStation = usePlayerStore((state) => state.playStation);
  const currentStation = usePlayerStore((state) => state.currentStation);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const openStationSheet = useUIStore((state) => state.openStationSheet);
  const active = currentStation?.id === station.id && isPlaying;

  return (
    <article className="group flex min-w-[250px] snap-start items-stretch border-2 border-on-background bg-surface md:min-w-0">
      <div className="flex w-10 shrink-0 items-center justify-center bg-on-background text-sm font-black text-surface">
        {String(rank).padStart(2, "0")}
      </div>
      <button
        type="button"
        className="flex size-16 shrink-0 items-center justify-center overflow-hidden border-r-2 border-on-background bg-[#252418]"
        onClick={() => openStationSheet(station)}
        title={`Open ${station.name}`}
      >
        <ChartThumbnail station={station} />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 px-3 py-2 text-left"
        onClick={() => openStationSheet(station)}
      >
        <span className="block truncate font-headline text-xs font-black uppercase tracking-tight">
          {(station.name || "UNKNOWN_STATION").replace(/\s+/g, "_")}
        </span>
        <span className="mt-0.5 block truncate text-[9px] font-black uppercase tracking-widest text-primary">
          {metricLabel(metric, entry)}
        </span>
        <StationHealthBadge health={health} className="mt-1 shadow-none" />
      </button>
      <button
        type="button"
        className="w-12 shrink-0 border-l-2 border-on-background bg-primary text-white transition hover:bg-on-background"
        onClick={() => playStation(station, getDefaultSelectedStream(station.streams))}
        title={active ? "Playing" : "Play"}
      >
        <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          {active ? "graphic_eq" : "play_arrow"}
        </span>
      </button>
    </article>
  );
}

function SignalChart({
  config,
  snapshot,
  stations,
  health,
  className,
}: {
  config: (typeof CHARTS)[number];
  snapshot: StationRankingSnapshot;
  stations: Map<string, ParsedStation>;
  health: ReturnType<typeof useStationHealth>["byAddress"];
  className?: string;
}) {
  const rows = snapshot.entries
    .map((entry) => ({ entry, station: stations.get(entry.stationAddress) }))
    .filter((row): row is { entry: StationRankingEntry; station: ParsedStation } => Boolean(row.station))
    .slice(0, 6);
  if (rows.length === 0) return null;

  return (
    <section className={cn("self-start border-4 border-on-background bg-surface-container-low shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]", className)}>
      <div className="flex items-center justify-between border-b-4 border-on-background px-4 py-2">
        <h3 className="font-headline text-base font-black uppercase tracking-tight">{config.title}</h3>
        <span className="text-[9px] font-black uppercase tracking-widest text-primary">{config.signal}</span>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto p-3 scrollbar-none overscroll-x-contain md:grid md:grid-cols-1 md:overflow-visible">
        {rows.map(({ entry, station }, index) => (
          <ChartItem
            key={entry.stationAddress}
            station={station}
            entry={entry}
            metric={snapshot.metric}
            rank={index + 1}
            health={health.get(entry.stationAddress)}
          />
        ))}
      </div>
    </section>
  );
}

function DownloadThumbnail({ song }: { song: ParsedSong }) {
  const [failed, setFailed] = useState(false);
  const image = song.thumb || song.coverArt;
  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="material-symbols-outlined text-2xl text-white/20">music_note</span>;
}

function RecentDownloadItem({ song, rank }: { song: ParsedSong; rank: number }) {
  const [playerOpen, setPlayerOpen] = useState(false);

  return (
    <article className="border-2 border-on-background bg-surface">
      <div className="group flex min-w-[250px] items-stretch md:min-w-0">
        <div className="flex w-10 shrink-0 items-center justify-center bg-on-background text-sm font-black text-surface">
          {String(rank).padStart(2, "0")}
        </div>
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden border-r-2 border-on-background bg-[#252418]">
          <DownloadThumbnail song={song} />
        </div>
        <div className="min-w-0 flex-1 px-3 py-2">
          <span className="block truncate font-headline text-xs font-black uppercase tracking-tight">
            {(song.title || "UNKNOWN_TRACK").replace(/\s+/g, "_")}
          </span>
          <span className="mt-0.5 block truncate text-[9px] font-black uppercase tracking-widest text-primary">
            {(song.artist || "UNKNOWN_ARTIST").replace(/\s+/g, "_")}
          </span>
          <span className="mt-1 block text-[8px] font-black uppercase tracking-widest text-on-background/45">
            BLOSSOM_FILE · {new Date(song.created_at * 1000).toLocaleDateString()}
          </span>
        </div>
        <div className="flex shrink-0 items-stretch border-l-2 border-on-background">
          <CrateSaveButton song={song} size="sm" className="w-10 justify-center border-0" />
          <button
            type="button"
            className="w-12 bg-primary text-white transition hover:bg-on-background"
            onClick={() => setPlayerOpen((open) => !open)}
            title={playerOpen ? "Close player" : `Play ${song.title || "download"}`}
          >
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              {playerOpen ? "stop" : "play_arrow"}
            </span>
          </button>
        </div>
      </div>
      {playerOpen && song.audioUrl && (
        <div className="border-t-2 border-on-background bg-black p-2">
          <video controls autoPlay src={song.audioUrl} className="max-h-56 w-full" />
        </div>
      )}
    </article>
  );
}

function RecentDownloadsChart({ songs, className }: { songs: ParsedSong[]; className?: string }) {
  if (songs.length === 0) return null;

  return (
    <section className={cn("self-start border-4 border-on-background bg-surface-container-low shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]", className)}>
      <div className="flex items-center justify-between border-b-4 border-on-background px-4 py-2">
        <h3 className="font-headline text-base font-black uppercase tracking-tight">RECENT_DOWNLOADS</h3>
        <span className="text-[9px] font-black uppercase tracking-widest text-primary">BLOSSOM_ARCHIVE</span>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto p-3 scrollbar-none overscroll-x-contain md:grid md:grid-cols-1 md:overflow-visible">
        {songs.map((song, index) => (
          <RecentDownloadItem key={song.address || song.id} song={song} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}

export function SignalCharts() {
  const { rankings, isLoading } = useStationRankings();
  const songFilters: Filter[] = useMemo(() => [{ kinds: [SONG_KIND], limit: 100 }], []);
  const { events: songEvents, isLoading: songsLoading } = useAppDataTimeline(songFilters);
  const recentDownloads = useMemo(() => {
    const byAddress = new Map<string, ParsedSong>();
    songEvents
      .map((event) => parseSongEvent(event))
      .filter((song) => song.audioUrl && song.youtubeId)
      .sort((a, b) => b.created_at - a.created_at)
      .forEach((song) => {
        const key = song.address || song.id;
        if (!byAddress.has(key)) byAddress.set(key, song);
      });
    return Array.from(byAddress.values()).slice(0, 6);
  }, [songEvents]);
  const addresses = useMemo(
    () =>
      Array.from(
        new Set(
          Array.from(rankings.values()).flatMap((ranking) =>
            ranking.entries.map((entry) => entry.stationAddress),
          ),
        ),
      ),
    [rankings],
  );
  const { byAddress, isLoading: stationsLoading } = useStationsByAddresses(addresses);
  const { byAddress: health } = useStationHealth(addresses);
  const visible = CHARTS.filter((chart) => {
    const snapshot = rankings.get(chart.metric);
    return snapshot?.entries.some((entry) => byAddress.has(entry.stationAddress));
  });
  const panelCount = visible.length + (recentDownloads.length > 0 ? 1 : 0);

  if ((isLoading || stationsLoading || songsLoading) && rankings.size === 0 && recentDownloads.length === 0) {
    return (
      <section className="mb-16 space-y-6" aria-label="Loading signal charts">
        <SectionHeader label="OBSERVER_FEED">SIGNAL_CHARTS</SectionHeader>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse border-4 border-on-background bg-on-background/5" />
          ))}
        </div>
      </section>
    );
  }
  if (panelCount === 0) return null;

  return (
    <section className="mb-16 space-y-6">
      <SectionHeader label="SIGNED_NETWORK_FEED">SIGNAL_CHARTS</SectionHeader>
      <div className="grid gap-6 md:grid-cols-2">
        {visible.map((chart, index) => (
          <SignalChart
            key={chart.metric}
            config={chart}
            snapshot={rankings.get(chart.metric)!}
            stations={byAddress}
            health={health}
            className={panelCount % 2 === 1 && index === panelCount - 1 ? "md:col-span-2" : undefined}
          />
        ))}
        <RecentDownloadsChart
          songs={recentDownloads}
          className={panelCount % 2 === 1 ? "md:col-span-2" : undefined}
        />
      </div>
      <div className="border-t-4 border-on-background/20" />
    </section>
  );
}
