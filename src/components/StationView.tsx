import { useStations } from "../lib/hooks/useStations";
import { MiniProfile } from "./MiniProfile";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function StationView() {
  const { events, eose } = useStations([{ limit: 50 }]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Radio Stations</h2>
      {events.map((station) => {
        return (
          <Card
            key={station.id}
            className="bg-card/50 backdrop-blur-sm border-muted"
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{station.name || "Unnamed Station"}</span>
                <MiniProfile userOrPubkey={station.pubkey} />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-2">
                {station.description && (
                  <p className="text-muted-foreground">{station.description}</p>
                )}
                {station.location && (
                  <p className="text-sm text-muted-foreground">
                    📍 {station.location}
                  </p>
                )}
                {station.genres && station.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {station.genres.map((genre, index) => (
                      <span
                        key={`${genre}-${index}`}
                        className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
                {station.streams && station.streams.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium">Streams:</p>
                    {station.streams.map((stream, index) => (
                      <div
                        key={index}
                        className="text-xs text-muted-foreground"
                      >
                        {stream?.format || 'Unknown'} - {stream?.quality?.bitrate || 0}kbps
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      }).filter(Boolean)}
    </div>
  );
}
