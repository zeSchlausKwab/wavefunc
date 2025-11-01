import { useState } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useWalletStore } from "../../stores/walletStore";
import { Plus, Trash2, Coins, Loader2 } from "lucide-react";
import { CashuWalletView } from "./CashuWalletView";
import { useCashuWallet } from "../../lib/hooks/useCashuWallet";
import {
  DEFAULT_CASHU_MINTS,
  DEFAULT_CASHU_RELAYS,
} from "../../lib/walletConstants";

export function CashuWalletSetup() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { setCashuWallet, cashuWallet } = useWalletStore();
  const { isLoading: isLoadingExisting, error: loadError } = useCashuWallet();
  const [mints, setMints] = useState<string[]>(DEFAULT_CASHU_MINTS);
  const [relays, setRelays] = useState<string[]>(DEFAULT_CASHU_RELAYS);
  const [primaryMint, setPrimaryMint] = useState<string>(
    DEFAULT_CASHU_MINTS[0] || ""
  );
  const [newMint, setNewMint] = useState("");
  const [newRelay, setNewRelay] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMint = () => {
    if (newMint.trim() && !mints.includes(newMint.trim())) {
      const updatedMints = [...mints, newMint.trim()];
      setMints(updatedMints);
      setNewMint("");
      // If this is the first mint, set it as primary
      if (mints.length === 0) {
        setPrimaryMint(newMint.trim());
      }
    }
  };

  const handleRemoveMint = (mint: string) => {
    const updatedMints = mints.filter((m) => m !== mint);
    setMints(updatedMints);
    // If removing the primary mint, set a new one
    if (primaryMint === mint && updatedMints.length > 0) {
      setPrimaryMint(updatedMints[0] || "");
    }
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

  const handleCreateWallet = async () => {
    if (!ndk) {
      setError("NDK not initialized");
      return;
    }

    if (!currentUser) {
      setError("Please log in to create a wallet");
      return;
    }

    if (mints.length === 0) {
      setError("Please add at least one mint");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create Cashu wallet with specified mints and relays
      // @ts-ignore - NDK type mismatch between packages
      const wallet = await NDKCashuWallet.create(ndk, mints, relays);

      // Start the wallet to begin monitoring
      await wallet.start();

      // Store the wallet with primary mint
      setCashuWallet(wallet, mints, relays, primaryMint);
    } catch (err) {
      console.error("Failed to create Cashu wallet:", err);
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setIsCreating(false);
    }
  };

  // Show loading state while checking for existing wallet
  if (isLoadingExisting) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Loading wallet from relays...
        </p>
        <p className="text-xs text-muted-foreground">
          This may take a few seconds
        </p>
      </div>
    );
  }

  // Show wallet view if wallet exists
  if (cashuWallet) {
    return <CashuWalletView />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h4 className="font-semibold">Cashu eCash Wallet (NIP-60)</h4>
        <p className="text-sm text-muted-foreground">
          Create a privacy-preserving eCash wallet using Cashu. Your tokens are
          stored encrypted on Nostr relays.
        </p>
      </div>

      {loadError && (
        <div className="p-3 text-sm text-amber-600 bg-amber-600/10 rounded-md">
          Failed to load existing wallet: {loadError}
        </div>
      )}

      {/* Mints Configuration */}
      <div className="space-y-3">
        <Label>Cashu Mints</Label>
        <p className="text-xs text-muted-foreground">
          The first mint will be set as the primary mint for deposits
        </p>
        <div className="space-y-2">
          {mints.map((mint, idx) => (
            <div
              key={mint}
              className={`flex items-center gap-2 p-2 rounded-md border ${
                idx === 0
                  ? "bg-orange-500/5 border-orange-500/20"
                  : "bg-muted border-border"
              }`}
            >
              {idx === 0 && (
                <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-600 rounded-full">
                  Primary
                </span>
              )}
              <span className="text-sm flex-1 break-all">{mint}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveMint(mint)}
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
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Relays Configuration */}
      <div className="space-y-3">
        <Label>Backup Relays</Label>
        <div className="space-y-2">
          {relays.map((relay) => (
            <div
              key={relay}
              className="flex items-center gap-2 p-2 bg-muted rounded-md"
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
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {!currentUser && (
        <div className="p-3 text-sm text-amber-600 bg-amber-600/10 rounded-md">
          Please log in to create a Cashu wallet
        </div>
      )}

      <Button
        onClick={handleCreateWallet}
        disabled={isCreating || !currentUser || mints.length === 0}
        className="w-full"
      >
        {isCreating ? "Creating Wallet..." : "Create Cashu Wallet"}
      </Button>
    </div>
  );
}
