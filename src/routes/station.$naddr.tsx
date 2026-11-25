import type { NostrEvent } from "applesauce-core/helpers/event";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  EventModel,
  ReplaceableModel,
} from "applesauce-core/models";
import {
  decodeAddressPointer,
  decodeEventPointer,
} from "applesauce-core/helpers/pointers";
import { useEventModel } from "applesauce-react/hooks";
import { Radio } from "lucide-react";
import { useMemo } from "react";
import { parseStationEvent, type ParsedStation } from "@/lib/nostr/domain";
import { StationDetail } from "@/components/StationDetail";
import { normalizeStationRouteParam } from "@/lib/share";
import { loadDirectory } from "@/lib/publicDirectory";
import type { PublicPage } from "@/lib/publicPageMetadata";

export const Route = createFileRoute("/station/$naddr")({
  loader: ({ params, abortController }) =>
    loadDirectory("/station/" + encodeURIComponent(params.naddr), abortController.signal),
  staleTime: 60_000,
  component: StationPage,
});

type StationLoadState =
  | { status: "found"; station: ParsedStation }
  | { status: "not-found" | "unavailable"; station: null };

function useStationByNaddr(naddr: string, page: PublicPage): StationLoadState {
  const stationPointer = useMemo(
    () => normalizeStationRouteParam(naddr),
    [naddr],
  );
  const decoded = useMemo(() => {
    const address = decodeAddressPointer(stationPointer);
    if (address) return { kind: "address" as const, pointer: address };
    if (page.kind === "station") {
      const { kind, pubkey, tags } = page.event;
      return { kind: "address" as const, pointer: { kind, pubkey, identifier: tags.find(t => t[0] === "d")?.[1] ?? "" } };
    }
    const eventPointer = decodeEventPointer(stationPointer);
    if (eventPointer) return { kind: "event" as const, pointer: eventPointer };
    return /^[a-f\d]{64}$/i.test(stationPointer)
      ? { kind: "event" as const, pointer: stationPointer.toLowerCase() }
      : null;
  }, [stationPointer, page]);

  // ReplaceableModel for naddr (AddressPointer), EventModel for note id /
  // EventPointer. Both are reactive — the runtime's event loader will pull
  // the event from configured relays in the background, and we'll re-render
  // as soon as it lands in the store.
  const replaceableEvent = useEventModel(
    ReplaceableModel<NostrEvent>,
    decoded?.kind === "address" ? [decoded.pointer] : null,
  );
  const eventModelEvent = useEventModel(
    EventModel<NostrEvent>,
    decoded?.kind === "event" ? [decoded.pointer] : null,
  );
  const event = (decoded?.kind === "address" ? replaceableEvent : eventModelEvent)
    ?? (page.kind === "station" ? page.event : undefined);

  // Memoize parsed station so the same NostrEvent reference yields a stable
  // wrapper across renders.
  const station = useMemo(
    () => (event?.kind === 31237 ? parseStationEvent(event) : null),
    [event],
  );

  if (station) return { status: "found", station };
  return { status: page.kind === "not-found" ? "not-found" : "unavailable", station: null };
}

function StationPage() {
  const { naddr } = Route.useParams();
  const result = useStationByNaddr(naddr, Route.useLoaderData());
  const router = useRouter();

  if (result.status !== "found") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Radio className="w-16 h-16 text-muted-foreground/20 mb-4" />
        <h1 className="text-2xl font-bold mb-2">{result.status === "not-found" ? "Station not found" : "Station temporarily unavailable"}</h1>
        {result.status === "unavailable" && <button className="underline" onClick={() => router.invalidate()}>Try again</button>}
      </div>
    );
  }

  return (
    <main className="w-full md:px-6">
      <Link to="/browse/genres" className="mb-3 inline-block font-bold underline">Browse genres</Link>
      <StationDetail station={result.station} withPadding={false} linkGenres />
    </main>
  );
}
