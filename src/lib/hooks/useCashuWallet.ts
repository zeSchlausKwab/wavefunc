import { useEffect, useState } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { useWalletStore } from "../../stores/walletStore";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { DEFAULT_CASHU_RELAYS } from "../walletConstants";

/**
 * Hook to automatically load existing Cashu wallet (NIP-60) from Nostr
 * or return null if no wallet exists.
 */
export function useCashuWallet() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { cashuWallet, cashuConnection, setCashuWallet, updateCashuBalance } =
    useWalletStore();
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
        let relays: string[] = [];
        if (wallet.relaySet) {
          relays = Array.from(wallet.relaySet.relays).map((relay) => relay.url);
        }

        console.log("Wallet relaySet:", wallet.relaySet);
        console.log("Extracted relays:", relays);
        console.log("Wallet mints:", wallet.mints);

        // If no relays found, try to get from store or use defaults
        if (relays.length === 0) {
          if (cashuConnection?.relays && cashuConnection.relays.length > 0) {
            console.log(
              "No relays in wallet, using stored relays:",
              cashuConnection.relays
            );
            relays = cashuConnection.relays;
          } else {
            console.log(
              "No relays found, using defaults:",
              DEFAULT_CASHU_RELAYS
            );
            relays = DEFAULT_CASHU_RELAYS;
          }
        }

        // Store the wallet
        const primaryMint = wallet.mints?.[0];
        setCashuWallet(wallet, wallet.mints, relays, primaryMint);

        // Get initial balance (may be 0 until tokens load)
        const initialBalance = wallet.state?.getBalance() || 0;
        console.log("Initial balance:", initialBalance);
        updateCashuBalance(initialBalance);

        // Start the wallet async and check balance periodically as it loads
        wallet
          .start()
          .then(() => {
            console.log("Wallet started, checking final balance");
            const finalBalance = wallet.state?.getBalance() || 0;
            updateCashuBalance(finalBalance);
          })
          .catch((err) => {
            console.error("Wallet start error:", err);
            // Still check balance even if there was an error
            const balance = wallet.state?.getBalance() || 0;
            updateCashuBalance(balance);
          });

        // Check balance a few times while tokens are loading
        // This handles cases where wallet.start() completes but tokens are still being processed
        const checkBalance = () => {
          const currentBalance = wallet.state?.getBalance() || 0;
          if (currentBalance !== initialBalance) {
            console.log("Balance changed to:", currentBalance);
            updateCashuBalance(currentBalance);
          }
        };

        setTimeout(checkBalance, 1000);
        setTimeout(checkBalance, 2000);
        setTimeout(checkBalance, 4000);
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
