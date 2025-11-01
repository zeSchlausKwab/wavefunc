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

const DEFAULT_MINTS = [
  "https://mint.minibits.cash/Bitcoin",
  "https://mint.coinos.io",
  "https://mint.cypherflow.ai",
];

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.minibits.cash",
  "wss://relay.coinos.io",
  "wss://nos.lol",
  "wss://relay.wavefunc.live",
  "wss://relay.cypherflow.ai",
];

export function CashuWalletSetup() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { setCashuWallet, cashuWallet } = useWalletStore();
  const { isLoading: isLoadingExisting, error: loadError } = useCashuWallet();
  const [mints, setMints] = useState<string[]>(DEFAULT_MINTS);
  const [relays, setRelays] = useState<string[]>(DEFAULT_RELAYS);
  const [newMint, setNewMint] = useState("");
  const [newRelay, setNewRelay] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMint = () => {
    if (newMint.trim() && !mints.includes(newMint.trim())) {
      setMints([...mints, newMint.trim()]);
      setNewMint("");
    }
  };

  const handleRemoveMint = (mint: string) => {
    setMints(mints.filter((m) => m !== mint));
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

      // Store the wallet
      setCashuWallet(wallet, mints, relays);
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
          Checking for existing wallet...
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
        <div className="space-y-2">
          {mints.map((mint) => (
            <div
              key={mint}
              className="flex items-center gap-2 p-2 bg-muted rounded-md"
            >
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
