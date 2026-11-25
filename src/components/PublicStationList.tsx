import { Link } from "@tanstack/react-router";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { useMemo, type ReactNode } from "react";
import { Play, SkipForward } from "lucide-react";
import { parseStationEvent } from "../lib/nostr/domain/station";
import { useStationHealth } from "../lib/nostr/hooks/useStationObservations";
import { canPlayStreamInApp, getDefaultSelectedStream, normalizeUrl } from "../lib/player/adapters";
import { publicStationPointer } from "../lib/publicPageMetadata";
import { usePlayerStore } from "../stores/playerStore";

interface PublicStationListProps {
  events: NostrEvent[];
  playLabel: string;
  description?: ReactNode;
  preferHealthy?: boolean;
}

export function PublicStationList({ events, playLabel, description, preferHealthy = false }: PublicStationListProps) {
  const listings = useMemo(() => events.map(event => {
    const parsed = parseStationEvent(event);
    const streams = Array.isArray(parsed.streams) ? parsed.streams.filter(stream =>
      typeof stream?.url === "string" && /^https?:\/\//i.test(normalizeUrl(stream.url)) && canPlayStreamInApp(stream)
    ) : [];
    return { station: { ...parsed, streams }, stream: getDefaultSelectedStream(streams), pointer: publicStationPointer(event) };
  }), [events]);
  const addresses = useMemo(() => listings.flatMap(({ station }) => station.address ? [station.address] : []), [listings]);
  const { byAddress } = useStationHealth(preferHealthy ? addresses : []);
  const currentAddress = usePlayerStore(s => s.state.kind === "idle" || s.state.kind === "paused" ? undefined : s.state.station.address);
  const play = usePlayerStore(s => s.playStation);
  // Keep the visible listing order. The genre dial prefers streams the observer
  // successfully checked in the past day. Collections use the curator's order.
  const candidates = listings.flatMap(listing => {
    if (!listing.stream) return [];
    const health = listing.station.address ? byAddress.get(listing.station.address) : undefined;
    const fresh = health && health.checkedAt >= Date.now() / 1000 - 86400;
    const priority = fresh && health.status === "up" ? 0 : fresh && health.status === "down" ? 2 : 1;
    const checked = priority === 0 && listing.station.streams.find(s => normalizeUrl(s.url) === health?.streamUrl);
    return [{ station: listing.station, stream: checked || listing.stream, priority }];
  }).sort((a, b) => a.priority - b.priority);
  const currentIndex = candidates.findIndex(({ station }) => station.address === currentAddress);
  const first = candidates[0];
  const next = currentIndex >= 0 && candidates.length > 1 ? candidates[(currentIndex + 1) % candidates.length] : undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {description && <p className="text-sm font-bold">{description}</p>}
        <div className="flex max-w-full flex-wrap gap-2">
          <button type="button" disabled={!first} onClick={() => first && play(first.station, first.stream)}
            className="flex min-h-11 max-w-full items-center gap-2 border-2 border-on-background bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-40">
            <Play size={16} aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{playLabel}</span>
          </button>
          {next && <button type="button" onClick={() => play(next.station, next.stream)}
            className="flex min-h-11 items-center gap-2 border-2 border-on-background px-4 py-2 font-bold hover:bg-secondary-fixed-dim">
            <SkipForward size={16} aria-hidden="true" /> Next station
          </button>}
        </div>
      </div>
      <ul className="divide-y-2 border-2 border-on-background">
        {listings.map(({ station, pointer, stream }) => <li key={station.id} className="flex items-stretch">
          <Link className="flex min-h-12 min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 px-4 py-3 hover:bg-surface-container-high focus-visible:underline"
            to="/station/$naddr" params={{ naddr: pointer }}>
            <span className="min-w-0 font-bold [overflow-wrap:anywhere]">{station.name || "Radio station"}</span>
            <span className="text-sm">{[station.location, station.countryCode].filter(Boolean).join(", ")}</span>
          </Link>
          {stream && <button type="button" aria-label={`Play ${station.name || "station"}`}
            onClick={() => play(station, stream)}
            className="grid min-w-12 shrink-0 place-items-center border-l-2 border-on-background hover:bg-secondary-fixed-dim">
            <Play size={16} aria-hidden="true" />
          </button>}
        </li>)}
      </ul>
    </div>
  );
}
