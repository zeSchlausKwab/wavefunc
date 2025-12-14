import { useNDK } from "@nostr-dev-kit/react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Plus, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import { Badge } from "../ui/badge";

export function RelaysSettings() {
  const { ndk } = useNDK();
  const [newRelayUrl, setNewRelayUrl] = useState("");

  const relays = ndk?.pool.relays;
  const relayList = relays ? Array.from(relays.values()) : [];

  const handleAddRelay = async () => {
    if (!ndk || !newRelayUrl) return;

    try {
      // Validate URL
      new URL(newRelayUrl);

      // Add relay to pool
      ndk.addExplicitRelay(newRelayUrl);
      setNewRelayUrl("");
    } catch (error) {
      alert(
        "Invalid relay URL. Please enter a valid WebSocket URL (ws:// or wss://)"
      );
    }
  };

  const handleRemoveRelay = (url: string) => {
    if (!ndk) return;

    const relay = relays?.get(url);
    if (relay) {
      relay.disconnect();
      ndk.pool.removeRelay(url);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Wifi className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Relay Configuration</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage the Nostr relays you connect to for discovering and publishing
          content.
        </p>
      </div>

      <div className="rounded-lg border border-border p-2 md:p-4 space-y-4">
        <Label htmlFor="new-relay">Add New Relay</Label>
        <div className="flex gap-2">
          <Input
            id="new-relay"
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            placeholder="wss://relay.example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAddRelay();
              }
            }}
          />
          <Button onClick={handleAddRelay} disabled={!newRelayUrl}>
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Label>Connected Relays ({relayList.length})</Label>
        {relayList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            No relays configured
          </div>
        ) : (
          <div className="space-y-2">
            {relayList.map((relay) => {
              const status = relay.connectivity?.status || "unknown";
              const isConnected = status === 1; // NDKRelayStatus.CONNECTED = 1

              return (
                <div
                  key={relay.url}
                  className="flex items-center justify-between p-2 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono truncate">
                        {relay.url}
                      </code>
                      <Badge variant={isConnected ? "default" : "secondary"}>
                        {isConnected ? "Connected" : "Disconnected"}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRelay(relay.url)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg bg-muted p-4 space-y-2">
        <h4 className="font-semibold text-sm">About Relays</h4>
        <p className="text-sm text-muted-foreground">
          Relays are servers that store and distribute Nostr events. Connecting
          to multiple relays increases redundancy and helps you discover more
          content. Popular relays include wss://relay.damus.io and
          wss://nos.lol.
        </p>
      </div>
    </div>
  );
}
