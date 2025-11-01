import { useEffect, useState } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { useWalletStore } from "../../stores/walletStore";
import type { NDKFilter } from "@nostr-dev-kit/ndk";

/**
 * Hook to automatically load existing Cashu wallet (NIP-60) from Nostr
 * or return null if no wallet exists.
 */
export function useCashuWallet() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { cashuWallet, setCashuWallet, updateCashuBalance } = useWalletStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWallet() {
      if (!ndk || !currentUser?.pubkey) return;

      // Don't reload if we already have a wallet
      if (cashuWallet) return;

      setIsLoading(true);
      setError(null);

      try {
        // Fetch kind 17375 (NIP-60 wallet configuration) events for current user
        const filter: NDKFilter = {
          kinds: [17375],
          authors: [currentUser.pubkey],
        };

        const events = await ndk.fetchEvents(filter, { groupable: false });

        if (events.size === 0) {
          setIsLoading(false);
          return;
        }

        // Get the most recent wallet event
        const walletEvents = Array.from(events).sort(
          (a, b) => (b.created_at || 0) - (a.created_at || 0)
        );
        const latestWalletEvent = walletEvents[0];

        if (!latestWalletEvent) {
          setIsLoading(false);
          return;
        }

        // Load the wallet from the event
        // @ts-ignore - NDK type mismatch between packages
        const wallet = await NDKCashuWallet.from(latestWalletEvent);

        if (!wallet) {
          setIsLoading(false);
          return;
        }

        // Get relays from the wallet's relaySet
        const relays = wallet.relaySet
          ? Array.from(wallet.relaySet.relays).map((relay) => relay.url)
          : [];

        // Store the wallet
        setCashuWallet(wallet, wallet.mints, relays);

        // Start the wallet to begin monitoring and loading tokens
        await wallet.start();

        // Update balance
        const balance = wallet.state?.getBalance() || 0;
        updateCashuBalance(balance);
      } catch (err) {
        console.error("Failed to load Cashu wallet:", err);
        setError(err instanceof Error ? err.message : "Failed to load wallet");
      } finally {
        setIsLoading(false);
      }
    }

    loadWallet();
  }, [
    ndk,
    currentUser?.pubkey,
    cashuWallet,
    setCashuWallet,
    updateCashuBalance,
  ]);

  return {
    isLoading,
    error,
    wallet: cashuWallet,
  };
}
