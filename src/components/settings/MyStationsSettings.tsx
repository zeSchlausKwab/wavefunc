import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useStations } from "@/lib/hooks/useStations";
import { RadioCard } from "../RadioCard";
import { StationManagementSheet } from "../StationManagementSheet";

export function MyStationsSettings() {
  const currentUser = useNDKCurrentUser();
  const { events: stations, eose } = useStations(
    currentUser ? [{ authors: [currentUser.pubkey] }] : [{}]
  );
  const isLoading = !eose;

  if (!currentUser) {
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
          mode="create"
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
            mode="create"
            trigger={
              <button className="flex items-center gap-1.5 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all">
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add Your First Station
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((station) => (
            <RadioCard key={station.id} station={station} />
          ))}
        </div>
      )}
    </div>
  );
}
