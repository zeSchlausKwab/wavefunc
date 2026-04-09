import { useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { actions, DEFAULT_RELAYS } from "../../lib/nostr/store";
import { CreateWallet as CreateWalletAction } from "applesauce-wallet/actions";
import { generateSecretKey } from "nostr-tools";

const SUGGESTED_MINTS = [
  "https://mint.minibits.cash/Bitcoin",
  "https://mint.coinos.io",
  "https://mint.cubabitcoin.org",
];

export function CreateWalletView() {
  const [selectedMints, setSelectedMints] = useState<string[]>([]);
  const [customMint, setCustomMint] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMint = (mint: string) => {
    setSelectedMints((prev) =>
      prev.includes(mint)
        ? prev.filter((m) => m !== mint)
        : [...prev, mint]
    );
  };

  const addCustomMint = () => {
    const url = customMint.trim();
    if (!url || selectedMints.includes(url)) return;
    setSelectedMints((prev) => [...prev, url]);
    setCustomMint("");
  };

  const handleCreate = useCallback(async () => {
    if (selectedMints.length === 0) return;
    setCreating(true);
    setError(null);

    try {
      const privateKey = generateSecretKey();
      await actions.run(CreateWalletAction, {
        mints: selectedMints,
        privateKey,
        relays: DEFAULT_RELAYS,
      });
    } catch (err: any) {
      console.error("Failed to create wallet:", err);
      setError(err?.message || "Failed to create wallet");
    } finally {
      setCreating(false);
    }
  }, [selectedMints]);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Create NIP-60 Wallet</CardTitle>
          <CardDescription>
            Select trusted Cashu mints to store your ecash tokens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Suggested Mints</p>
            <div className="space-y-2">
              {SUGGESTED_MINTS.map((mint) => {
                const isSelected = selectedMints.includes(mint);
                return (
                  <div
                    key={mint}
                    onClick={() => toggleMint(mint)}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "hover:border-muted-foreground/30"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="font-mono text-sm truncate">{mint}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Custom Mint</p>
            <div className="flex gap-2">
              <Input
                placeholder="https://mint.example.com"
                value={customMint}
                onChange={(e) => setCustomMint(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomMint()}
              />
              <Button variant="outline" onClick={addCustomMint} disabled={!customMint.trim()}>
                Add
              </Button>
            </div>
          </div>

          {selectedMints.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedMints.length} mint{selectedMints.length !== 1 ? "s" : ""} selected
            </p>
          )}

          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={creating || selectedMints.length === 0}
          >
            {creating ? "Creating Wallet..." : "Create Wallet"}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <p className="text-xs text-muted-foreground text-center">
            Your wallet data is encrypted and stored on Nostr relays (NIP-60).
            Only you can unlock it with your signing key.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
