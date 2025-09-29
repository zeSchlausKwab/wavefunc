import { useStations } from "../lib/hooks/useStations";
import { RadioCard } from "./RadioCard";

export function StationView() {
  const { events, eose } = useStations([{ limit: 50 }]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Radio Stations</h2>
      
      {/* Grid layout for RadioCard components */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {events.map((station) => (
          <RadioCard key={station.id} station={station} />
        ))}
      </div>
      
      {/* Loading state */}
      {!eose && events.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          Loading stations...
        </div>
      )}
      
      {/* Empty state */}
      {eose && events.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No radio stations found.
        </div>
      )}
    </div>
  );
}
