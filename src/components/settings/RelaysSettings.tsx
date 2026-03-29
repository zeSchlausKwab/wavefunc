import { useNDK } from "@nostr-dev-kit/react";
import { useState } from "react";

export function RelaysSettings() {
  const { ndk } = useNDK();
  const [newRelayUrl, setNewRelayUrl] = useState("");

  const relays = ndk?.pool.relays;
  const relayList = relays ? Array.from(relays.values()) : [];

  const handleAddRelay = async () => {
    if (!ndk || !newRelayUrl) return;
    try {
      new URL(newRelayUrl);
      ndk.addExplicitRelay(newRelayUrl);
      setNewRelayUrl("");
    } catch {
      alert("Invalid relay URL. Please enter a valid WebSocket URL (ws:// or wss://)");
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
      {/* Section header */}
      <div className="flex items-center gap-2 pb-3 border-b-4 border-on-background">
        <span className="material-symbols-outlined text-[20px]">wifi</span>
        <h3 className="text-base font-black uppercase tracking-tighter">Relay Configuration</h3>
      </div>

      <p className="text-sm text-on-background/60">
        Manage the Nostr relays you connect to for discovering and publishing content.
      </p>

      {/* Add relay */}
      <div className="border-4 border-on-background p-4 space-y-3">
        <label className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
          Add New Relay
        </label>
        <div className="flex border-2 border-on-background">
          <input
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            placeholder="wss://relay.example.com"
            onKeyDown={(e) => { if (e.key === "Enter") handleAddRelay(); }}
            className="flex-1 bg-surface text-on-background px-3 py-2 text-sm font-mono focus:outline-none placeholder:text-on-background/30"
          />
          <button
            onClick={handleAddRelay}
            disabled={!newRelayUrl}
            className="border-l-2 border-on-background px-4 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add
          </button>
        </div>
      </div>

      {/* Relay list */}
      <div className="space-y-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
          Connected Relays ({relayList.length})
        </span>

        {relayList.length === 0 ? (
          <div className="border-4 border-dashed border-on-background/30 p-10 text-center">
            <span className="material-symbols-outlined text-[40px] text-on-background/20">wifi_off</span>
            <p className="text-sm text-on-background/40 mt-2 font-medium">No relays configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {relayList.map((relay) => {
              const isConnected = relay.connectivity?.status === 1;
              return (
                <div
                  key={relay.url}
                  className="flex items-center justify-between border-2 border-on-background px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`w-2 h-2 shrink-0 ${isConnected ? "bg-green-500" : "bg-on-background/30"}`}
                    />
                    <code className="text-xs font-mono truncate">{relay.url}</code>
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${
                        isConnected ? "text-green-600" : "text-on-background/40"
                      }`}
                    >
                      {isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveRelay(relay.url)}
                    className="ml-2 p-1 hover:bg-surface-container-high transition-colors shrink-0"
                    title="Remove relay"
                  >
                    <span className="material-symbols-outlined text-[16px] text-on-background/60 hover:text-red-600">
                      delete
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="border-2 border-on-background/30 bg-surface-container-low p-4 space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-widest">About Relays</h4>
        <p className="text-sm text-on-background/60">
          Relays are servers that store and distribute Nostr events. Connecting to
          multiple relays increases redundancy and helps you discover more content.
          Popular relays include wss://relay.damus.io and wss://nos.lol.
        </p>
      </div>
    </div>
  );
}
