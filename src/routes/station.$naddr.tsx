import { createFileRoute } from "@tanstack/react-router";
import { use$ } from "applesauce-react/hooks";
import {
  decodeAddressPointer,
  decodeEventPointer,
} from "applesauce-core/helpers/pointers";
import { Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseStationEvent, type ParsedStation } from "@/lib/nostr/domain";
import { useWavefuncNostr } from "@/lib/nostr/runtime";
import { StationDetail } from "@/components/StationDetail";

const NOT_FOUND_TIMEOUT_MS = 10_000;

export const Route = createFileRoute("/station/$naddr")({
  component: StationPage,
});

type StationLoadState =
  | { status: "loading"; station: null }
  | { status: "found"; station: ParsedStation }
  | { status: "not-found"; station: null };

function useStationByNaddr(naddr: string): StationLoadState {
  const { eventStore } = useWavefuncNostr();

  const pointer = useMemo(
    () =>
      decodeAddressPointer(naddr) ?? decodeEventPointer(naddr) ?? naddr,
    [naddr],
  );

  // eventStore.event() emits undefined while the event isn't in the store
  // (the runtime's event loader will fetch it from configured relays in the
  // background) and emits the NostrEvent once it lands.
  const event = use$(
    () => eventStore.event(pointer),
    [eventStore, pointer],
  );

  // Separate "still loading" from "definitely not found" via a timeout that
  // resets when naddr changes.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (event) return;
    const id = setTimeout(() => setTimedOut(true), NOT_FOUND_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [naddr, event]);

  // Memoize parsed station so the same NostrEvent reference yields a stable
  // wrapper across renders.
  const station = useMemo(
    () => (event ? parseStationEvent(event) : null),
    [event],
  );

  if (station) return { status: "found", station };
  if (timedOut) return { status: "not-found", station: null };
  return { status: "loading", station: null };
}

function StationPage() {
  const { naddr } = Route.useParams();
  const result = useStationByNaddr(naddr);

  if (result.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-muted-foreground">Loading station...</p>
      </div>
    );
  }

  if (result.status === "not-found") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Radio className="w-16 h-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Station Not Found</h2>
        <p className="text-muted-foreground">
          The requested station could not be found.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full px-4 md:px-6">
      <StationDetail station={result.station} withPadding={false} />
    </div>
  );
}
