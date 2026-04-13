import {
  decodeAddressPointer,
  decodeEventPointer,
} from "applesauce-core/helpers/pointers";
import { useObservableEagerMemo } from "applesauce-react/hooks";
import { combineLatest, map, of } from "rxjs";
import { withImmediateValueOrDefault } from "applesauce-core";
import { useHistoryStore } from "../stores/historyStore";
import { parseStationEvent, type ParsedStation } from "../lib/nostr/domain";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { usePlayerStore } from "../stores/playerStore";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

interface HistorySheetProps {
  trigger?: React.ReactNode;
}

export function HistorySheet({ trigger }: HistorySheetProps) {
  const { eventStore } = useWavefuncNostr();
  const { history, clearHistory, removeFromHistory } = useHistoryStore();
  const { playStation } = usePlayerStore();

  const historyKey = history.map((entry) => entry.stationId).join(",");

  const stations = useObservableEagerMemo<Map<string, ParsedStation>>(
    () => {
      if (history.length === 0) {
        return of(new Map<string, ParsedStation>());
      }

      const entryStreams = history.map((entry) => {
        const pointer =
          decodeAddressPointer(entry.stationId) ??
          decodeEventPointer(entry.stationId) ??
          entry.stationId;

        return eventStore.event(pointer).pipe(
          map((event) =>
            event
              ? ([entry.stationId, parseStationEvent(event)] as const)
              : null,
          ),
        );
      });

      return combineLatest(entryStreams).pipe(
        map(
          (entries) =>
            new Map(
              entries.filter(
                (e): e is readonly [string, ParsedStation] => e !== null,
              ),
            ),
        ),
        withImmediateValueOrDefault(new Map<string, ParsedStation>()),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventStore, historyKey],
  );

  const loading = history.length > 0 && stations.size < history.length;

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
          <button className="p-2 hover:bg-on-background/10 transition-colors" title="Play history">
            <span className="material-symbols-outlined text-[20px]">history</span>
          </button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md border-l-4 border-on-background bg-background p-0">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight font-headline">
            <span className="material-symbols-outlined text-[22px]">history</span>
            PLAY_HISTORY
          </SheetTitle>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
            RECENTLY_PLAYED_STATIONS (LAST_50)
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-5 pt-4 pb-5">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-6xl text-on-background/20 block mb-4">radio</span>
              <p className="text-xl font-black uppercase tracking-tight font-headline">
                NO_HISTORY_YET
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 mt-2">
                START_PLAYING_STATIONS_TO_SEE_THEM_HERE
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
                  {history.length} {history.length === 1 ? "STATION" : "STATIONS"}
                </p>
                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
                  CLEAR_ALL
                </button>
              </div>

              <div className="flex-1 space-y-[-2px] overflow-y-auto">
                {loading && stations.size === 0 ? (
                  <div className="space-y-[-2px]">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-16 border-2 border-on-background bg-surface-container-low animate-pulse" />
                    ))}
                  </div>
                ) : (
                  history.map((entry) => {
                    const station = stations.get(entry.stationId);

                    return (
                      <div
                        key={entry.timestamp}
                        className="flex items-center gap-3 p-3 border-2 border-on-background bg-surface-container-high hover:bg-secondary-fixed-dim transition-colors group"
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
                              className="w-10 h-10 object-cover flex-shrink-0 border-2 border-on-background"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-on-background/10 flex items-center justify-center flex-shrink-0 border-2 border-on-background">
                              <span className="material-symbols-outlined text-[18px] text-on-background/30">radio</span>
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm uppercase tracking-tight truncate">
                              {station?.name || "LOADING..."}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
                              {formatTimestamp(entry.timestamp)}
                            </p>
                          </div>
                        </button>

                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 hover:text-primary"
                          onClick={() => removeFromHistory(entry.timestamp)}
                          title="Remove from history"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
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
