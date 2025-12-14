import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useStations } from "@/lib/hooks/useStations";
import { RadioCard } from "../RadioCard";
import { Button } from "../ui/button";
import { Plus, Radio } from "lucide-react";
import { StationManagementSheet } from "../StationManagementSheet";

export function MyStationsSettings() {
  const currentUser = useNDKCurrentUser();
  const { events: stations, eose } = useStations(
    currentUser ? [{ authors: [currentUser.pubkey] }] : [{}]
  );
  const isLoading = !eose;

  if (!currentUser) {
    return (
      <div className="text-muted-foreground">
        Please log in to manage your stations.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground">Loading your stations...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5" />
            <h3 className="text-lg font-semibold">My Stations</h3>
          </div>
          <StationManagementSheet
            mode="create"
            trigger={
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Station
              </Button>
            }
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Manage radio stations you've added to the network.
        </p>
      </div>

      {stations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-4">
          <Radio className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <div className="space-y-2">
            <h4 className="font-semibold">No stations yet</h4>
            <p className="text-sm text-muted-foreground">
              Add your first radio station to share it with the community.
            </p>
          </div>
          <StationManagementSheet
            mode="create"
            trigger={
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Station
              </Button>
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
