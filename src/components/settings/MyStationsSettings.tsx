import { useMyStations } from "@/lib/nostr/hooks/useStations";
import { useWavefuncNostr } from "@/lib/nostr/runtime";
import { StationManagementSheet } from "../StationManagementSheet";

export function MyStationsSettings() {
  const { currentPubkey } = useWavefuncNostr();
  const { events: stations, eose } = useMyStations(currentPubkey);
  const isLoading = !eose;

  if (!currentPubkey) {
    return (
      <p className="text-sm text-on-background/60">Please log in to manage your stations.</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-on-background/60">
        <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
        <span className="text-sm">Loading your stations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between pb-3 border-b-4 border-on-background">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">radio</span>
          <h3 className="text-base font-black uppercase tracking-tighter">My Stations</h3>
        </div>
        <StationManagementSheet
          mode="add"
          trigger={
            <button className="flex items-center gap-1.5 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all">
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Station
            </button>
          }
        />
      </div>

      <p className="text-sm text-on-background/60">
        Manage radio stations you've added to the network.
      </p>

      {stations.length === 0 ? (
        <div className="border-4 border-dashed border-on-background/30 p-12 text-center space-y-4">
          <span className="material-symbols-outlined text-[48px] text-on-background/20">radio</span>
          <div className="space-y-1">
            <h4 className="text-sm font-black uppercase tracking-tighter">No stations yet</h4>
            <p className="text-sm text-on-background/60">
              Add your first radio station to share it with the community.
            </p>
          </div>
          <StationManagementSheet
            mode="add"
            trigger={
              <button className="flex items-center gap-1.5 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all">
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add Your First Station
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {stations.map((station) => (
            <div
              key={station.id}
              className="border-4 border-on-background bg-surface-container-low p-4 shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden border-2 border-on-background bg-surface">
                      {station.thumbnail ? (
                        <img
                          src={station.thumbnail}
                          alt={station.name || "Station"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="material-symbols-outlined text-on-background/25">
                            radio
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-black uppercase tracking-tight">
                        {station.name || "Untitled Station"}
                      </h4>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-on-background/60">
                        {station.stationId?.toUpperCase() || "NO_IDENTIFIER"}
                      </p>
                    </div>
                  </div>

                  {station.description && (
                    <p className="line-clamp-2 text-sm text-on-background/75">
                      {station.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {station.genres.slice(0, 4).map((genre) => (
                      <span
                        key={genre}
                        className="border-2 border-on-background/25 px-2 py-1 text-[10px] font-black uppercase tracking-widest"
                      >
                        {genre}
                      </span>
                    ))}
                    {station.languages.slice(0, 2).map((language) => (
                      <span
                        key={language}
                        className="bg-on-background px-2 py-1 text-[10px] font-black uppercase tracking-widest text-surface"
                      >
                        {language}
                      </span>
                    ))}
                  </div>

                  <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
                    {station.streams.length} stream{station.streams.length === 1 ? "" : "s"}
                    {station.countryCode ? ` • ${station.countryCode}` : ""}
                  </div>
                </div>

                <StationManagementSheet
                  station={station}
                  mode="edit"
                  trigger={
                    <button className="shrink-0 border-4 border-on-background bg-surface px-3 py-2 text-[11px] font-black uppercase tracking-widest shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none">
                      Edit
                    </button>
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
