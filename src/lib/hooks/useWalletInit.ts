import { useEffect, useRef } from "react";
import { useNDK } from "@nostr-dev-kit/react";
import { useWalletStore } from "../../stores/walletStore";
import { restoreNWCWallet } from "../nwcWalletUtils";

/**
 * Hook to initialize and restore wallets on app startup
 * This ensures that NWC wallets stored in localStorage are properly
 * recreated and assigned to the NDK instance
 */
export function useWalletInit() {
  const { ndk } = useNDK();
  const { nwcConnection, setNWCWallet } = useWalletStore();
  const initialized = useRef(false);

  useEffect(() => {
    // Only run once when NDK is ready
    if (!ndk || initialized.current) return;

    // Only restore if we have a stored connection but no active wallet
    const state = useWalletStore.getState();
    if (!nwcConnection || state.nwcWallet) return;

    initialized.current = true;

    const restoreWallet = async () => {
      try {
        if (!nwcConnection.connectionString) {
          return;
        }

        const wallet = restoreNWCWallet(ndk, nwcConnection.connectionString);
        setNWCWallet(wallet, nwcConnection.connectionString);
      } catch (err) {
        console.error("Failed to restore NWC wallet:", err);
        state.disconnectNWC();
      }
    };

    restoreWallet();
  }, [ndk, nwcConnection, setNWCWallet]);
}
