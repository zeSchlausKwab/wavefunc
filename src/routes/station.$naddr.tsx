import { createFileRoute } from "@tanstack/react-router";
import { useNDK } from "@nostr-dev-kit/react";
import { useState, useEffect } from "react";
import { NDKStation } from "@/lib/NDKStation";
import { Radio } from "lucide-react";
import { StationDetail } from "@/components/StationDetail";

export const Route = createFileRoute("/station/$naddr")({
  component: StationPage,
});

function StationPage() {
  const { naddr } = Route.useParams();
  const { ndk } = useNDK();
  const [station, setStation] = useState<NDKStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStation() {
      if (!ndk) {
        setError("NDK not initialized");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Decode the naddr and fetch the event
        const event = await ndk.fetchEvent(naddr);

        if (!event) {
          setError("Station not found");
          setLoading(false);
          return;
        }

        // Convert to NDKStation
        const stationEvent = NDKStation.from(event);
        setStation(stationEvent);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching station:", err);
        setError(err instanceof Error ? err.message : "Failed to load station");
        setLoading(false);
      }
    }

    fetchStation();
  }, [naddr, ndk]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-muted-foreground">Loading station...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <Radio className="w-16 h-16 text-muted-foreground/20 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Station Not Found</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
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

  // Render the station detail as a full-page view
  return (
    <div className="w-full px-4 md:px-6">
      <StationDetail station={station} withPadding={false} />
    </div>
  );
}
