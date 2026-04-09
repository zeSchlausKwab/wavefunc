import { useState } from "react";
import { useWavefuncNostr } from "@/lib/nostr/runtime";

export function RelaysSettings() {
  const { readRelays, writeRelays } = useWavefuncNostr();
  const [newRelayUrl, setNewRelayUrl] = useState("");

  const relayList = Array.from(
    new Set([
      ...readRelays.map((url) => ({ url, mode: "read" as const })),
      ...writeRelays.map((url) => ({ url, mode: "write" as const })),
    ].map((entry) => `${entry.url}::${entry.mode}`))
  ).map((entry) => {
    const [url, mode] = entry.split("::");
    return { url: url ?? "", mode: mode === "write" ? "write" as const : "read" as const };
  });

  const handleAddRelay = async () => {
    if (!newRelayUrl) return;
    try {
      new URL(newRelayUrl);
      alert("Dynamic relay editing has not been rebuilt on Applesauce yet.");
    } catch {
      alert("Invalid relay URL. Please enter a valid WebSocket URL (ws:// or wss://)");
    }
  };

  const handleRemoveRelay = () => {
    alert("Dynamic relay editing has not been rebuilt on Applesauce yet.");
  };

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-2 pb-3 border-b-4 border-on-background">
        <span className="material-symbols-outlined text-[20px]">wifi</span>
        <h3 className="text-base font-black uppercase tracking-tighter">Relay Configuration</h3>
      </div>

      <p className="text-sm text-on-background/60">
        Current runtime relays are now owned by the Applesauce provider. Editing them in-app has not been rebuilt yet.
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
              return (
                <div
                  key={relay.url}
                  className="flex items-center justify-between border-2 border-on-background px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-2 h-2 shrink-0 bg-green-500" />
                    <code className="text-xs font-mono truncate">{relay.url}</code>
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${
                        relay.mode === "write" ? "text-primary" : "text-green-600"
                      }`}
                    >
                      {relay.mode === "write" ? "WRITE" : "READ"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveRelay()}
                    className="ml-2 p-1 hover:bg-surface-container-high transition-colors shrink-0"
                    title="Relay editing not available yet"
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
          Relay configuration is currently sourced from app config and the Applesauce runtime. In-app relay editing will need a dedicated settings flow instead of mutating an NDK pool.
        </p>
      </div>
    </div>
  );
}
