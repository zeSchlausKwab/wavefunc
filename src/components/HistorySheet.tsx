import { History, Radio, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNDK } from "@nostr-dev-kit/react";
import { useHistoryStore } from "../stores/historyStore";
import { NDKStation } from "../lib/NDKStation";
import { usePlayerStore } from "../stores/playerStore";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

interface HistorySheetProps {
  trigger?: React.ReactNode;
}

export function HistorySheet({ trigger }: HistorySheetProps) {
  const { ndk } = useNDK();
  const { history, clearHistory, removeFromHistory } = useHistoryStore();
  const { playStation } = usePlayerStore();
  const [stations, setStations] = useState<Map<string, NDKStation>>(new Map());
  const [loading, setLoading] = useState(false);

  // Fetch stations when history changes
  useEffect(() => {
    if (!ndk || history.length === 0) {
      setStations(new Map());
      return;
    }

    async function fetchStations() {
      setLoading(true);
      const newStations = new Map<string, NDKStation>();

      // Fetch each station from history
      for (const entry of history) {
        try {
          const event = await ndk!.fetchEvent(entry.stationId);
          if (event) {
            const station = NDKStation.from(event);
            newStations.set(entry.stationId, station);
          }
        } catch (err) {
          console.error(`Failed to fetch station ${entry.stationId}:`, err);
        }
      }

      setStations(newStations);
      setLoading(false);
    }

    fetchStations();
  }, [ndk, history]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const handlePlayStation = (stationId: string) => {
    const station = stations.get(stationId);
    if (station) {
      playStation(station);
    }
  };

  const handleClearHistory = () => {
    if (
      confirm("Are you sure you want to clear all play history? This cannot be undone.")
    ) {
      clearHistory();
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" title="Play history">
            <History className="w-4 h-4" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Play History
          </SheetTitle>
          <SheetDescription>
            Recently played stations (last 50)
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Radio className="w-16 h-16 text-muted-foreground/20 mb-4" />
              <p className="text-muted-foreground">No play history yet</p>
              <p className="text-sm text-muted-foreground/60 mt-2">
                Start playing some stations to see them here
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">
                  {history.length} {history.length === 1 ? "station" : "stations"}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              </div>

              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {loading && stations.size === 0 ? (
                  <div className="flex justify-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  </div>
                ) : (
                  history.map((entry) => {
                    const station = stations.get(entry.stationId);

                    return (
                      <div
                        key={entry.timestamp}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                      >
                        <button
                          onClick={() => handlePlayStation(entry.stationId)}
                          className="flex-1 flex items-center gap-3 min-w-0 text-left"
                          disabled={!station}
                        >
                          {station?.thumbnail ? (
                            <img
                              src={station.thumbnail}
                              alt={station.name}
                              className="w-12 h-12 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                              <Radio className="w-6 h-6 text-gray-400" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {station?.name || "Loading..."}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimestamp(entry.timestamp)}
                            </p>
                          </div>
                        </button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={() => removeFromHistory(entry.timestamp)}
                          title="Remove from history"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
