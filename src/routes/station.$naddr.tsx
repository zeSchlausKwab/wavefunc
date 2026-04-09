import { createFileRoute } from "@tanstack/react-router";
import { use$ } from "applesauce-react/hooks";
import {
  decodeAddressPointer,
  decodeEventPointer,
} from "applesauce-core/helpers/pointers";
import { Radio } from "lucide-react";
import { filter, map, timeout } from "rxjs";
import { parseStationEvent, type ParsedStation } from "@/lib/nostr/domain";
import { useWavefuncNostr } from "@/lib/nostr/runtime";
import { StationDetail } from "@/components/StationDetail";

export const Route = createFileRoute("/station/$naddr")({
  component: StationPage,
});

function useStationByNaddr(naddr: string): { station: ParsedStation | null; loading: boolean } {
  const { eventStore } = useWavefuncNostr();

  const pointer =
    decodeAddressPointer(naddr) ??
    decodeEventPointer(naddr) ??
    naddr;

  const event = use$(
    () =>
      eventStore.event(pointer).pipe(
        filter((e) => e !== undefined),
        map((e) => e ?? null),
        timeout({ first: 10_000, with: () => [null] }),
      ),
    [eventStore, naddr],
  );

  if (event === undefined) return { station: null, loading: true };
  if (event === null) return { station: null, loading: false };

  return { station: parseStationEvent(event), loading: false };
}

function StationPage() {
  const { naddr } = Route.useParams();
  const { station, loading } = useStationByNaddr(naddr);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-muted-foreground">Loading station...</p>
      </div>
    );
  }

  if (!station) {
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
      <StationDetail station={station} withPadding={false} />
    </div>
  );
}
