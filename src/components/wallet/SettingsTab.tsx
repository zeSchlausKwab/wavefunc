import { useState, useEffect } from "react";
import { Settings, Plus, Trash2, Star } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface SettingsTabProps {
  cashuConnection?: {
    mints?: string[];
    relays?: string[];
    primaryMint?: string;
  };
  onSaveSettings: (
    mints: string[],
    relays: string[],
    primaryMint: string
  ) => void;
}

export function SettingsTab({
  cashuConnection,
  onSaveSettings,
}: SettingsTabProps) {
  const [mints, setMints] = useState<string[]>(cashuConnection?.mints || []);
  const [relays, setRelays] = useState<string[]>(cashuConnection?.relays || []);
  const [primaryMint, setPrimaryMint] = useState<string>(
    cashuConnection?.primaryMint || cashuConnection?.mints?.[0] || ""
  );
  const [newMint, setNewMint] = useState("");
  const [newRelay, setNewRelay] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Sync local state with store
  useEffect(() => {
    if (cashuConnection) {
      setMints(cashuConnection.mints || []);
      setRelays(cashuConnection.relays || []);
      setPrimaryMint(
        cashuConnection.primaryMint || cashuConnection.mints?.[0] || ""
      );
    }
  }, [cashuConnection]);

  const handleAddMint = () => {
    if (newMint.trim() && !mints.includes(newMint.trim())) {
      const updatedMints = [...mints, newMint.trim()];
      setMints(updatedMints);
      setNewMint("");
      // If this is the first mint, set it as primary
      if (!primaryMint) {
        setPrimaryMint(newMint.trim());
      }
    }
  };

  const handleRemoveMint = (mint: string) => {
    if (mints.length <= 1) {
      setSettingsError("You must have at least one mint configured");
      return;
    }
    const updatedMints = mints.filter((m) => m !== mint);
    setMints(updatedMints);
    // If removing the primary mint, set a new one
    if (primaryMint === mint) {
      setPrimaryMint(updatedMints[0] || "");
    }
    setSettingsError(null);
  };

  const handleAddRelay = () => {
    if (newRelay.trim() && !relays.includes(newRelay.trim())) {
      setRelays([...relays, newRelay.trim()]);
      setNewRelay("");
    }
  };

  const handleRemoveRelay = (relay: string) => {
    setRelays(relays.filter((r) => r !== relay));
  };

  const handleSetPrimaryMint = (mint: string) => {
    setPrimaryMint(mint);
  };

  const handleSaveSettings = () => {
    if (mints.length === 0) {
      setSettingsError("You must have at least one mint configured");
      return;
    }

    if (!primaryMint || !mints.includes(primaryMint)) {
      setSettingsError("Primary mint must be one of the configured mints");
      return;
    }

    try {
      onSaveSettings(mints, relays, primaryMint);
      setSettingsSuccess(true);
      setSettingsError(null);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSettingsError(
        error instanceof Error ? error.message : "Failed to save settings"
      );
    }
  };

  return (
    <div className="space-y-4 max-w-full">
      <div className="rounded-lg border border-border p-2 md:p-4 space-y-6 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Wallet Settings
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage your Cashu mints and backup relays
          </p>
        </div>

        {/* Mints Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Cashu Mints</Label>
            <p className="text-sm text-muted-foreground">
              Mints are trusted servers that issue Cashu tokens. You need at
              least one mint configured.
            </p>
          </div>

          <div className="space-y-2">
            {mints.map((mint) => (
              <div
                key={mint}
                className={`flex items-center gap-2 p-3 rounded-md border ${
                  mint === primaryMint
                    ? "bg-orange-500/5 border-orange-500/20"
                    : "bg-muted border-border"
                }`}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSetPrimaryMint(mint)}
                  className={`p-1 ${
                    mint === primaryMint
                      ? "text-orange-500"
                      : "text-muted-foreground"
                  }`}
                  title={
                    mint === primaryMint
                      ? "Primary mint (used for deposits)"
                      : "Set as primary mint"
                  }
                >
                  <Star
                    className={`w-4 h-4 ${
                      mint === primaryMint ? "fill-current" : ""
                    }`}
                  />
                </Button>
                <span className="text-sm flex-1 break-all">{mint}</span>
                {mint === primaryMint && (
                  <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-600 rounded-full">
                    Primary
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMint(mint)}
                  disabled={mints.length === 1}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://mint.example.com"
              value={newMint}
              onChange={(e) => setNewMint(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMint()}
            />
            <Button onClick={handleAddMint} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        {/* Relays Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Backup Relays</Label>
            <p className="text-sm text-muted-foreground">
              Relays store your encrypted Cashu tokens. Using multiple relays
              ensures your tokens are backed up.
            </p>
          </div>

          <div className="space-y-2">
            {relays.map((relay) => (
              <div
                key={relay}
                className="flex items-center gap-2 p-3 bg-muted rounded-md border border-border"
              >
                <span className="text-sm flex-1 break-all">{relay}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRelay(relay)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="wss://relay.example.com"
              value={newRelay}
              onChange={(e) => setNewRelay(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRelay()}
            />
            <Button onClick={handleAddRelay} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        {settingsError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {settingsError}
          </div>
        )}

        {settingsSuccess && (
          <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
            Settings saved successfully!
          </div>
        )}

        <Button onClick={handleSaveSettings} className="w-full">
          <Settings className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
