import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NDKWallet } from "@nostr-dev-kit/wallet";

export interface WalletConnection {
  type: "nwc" | "cashu";
  connectionString?: string; // For NWC
  mints?: string[]; // For Cashu
  relays?: string[]; // For Cashu
  name?: string;
  connectedAt: number;
}

interface WalletState {
  // Active wallets
  nwcWallet: NDKWallet | null;
  cashuWallet: NDKWallet | null;
  activeWalletType: "nwc" | "cashu" | null;

  // Connection info (persisted)
  nwcConnection: WalletConnection | null;
  cashuConnection: WalletConnection | null;

  // Actions
  setNWCWallet: (wallet: NDKWallet | null, connectionString?: string) => void;
  setCashuWallet: (
    wallet: NDKWallet | null,
    mints?: string[],
    relays?: string[]
  ) => void;
  setActiveWalletType: (type: "nwc" | "cashu" | null) => void;
  disconnectNWC: () => void;
  disconnectCashu: () => void;
  getActiveWallet: () => NDKWallet | null;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      nwcWallet: null,
      cashuWallet: null,
      activeWalletType: null,
      nwcConnection: null,
      cashuConnection: null,

      setNWCWallet: (wallet, connectionString) => {
        set({
          nwcWallet: wallet,
          nwcConnection: wallet
            ? {
                type: "nwc",
                connectionString,
                connectedAt: Date.now(),
              }
            : null,
          activeWalletType: wallet ? "nwc" : get().activeWalletType,
        });
      },

      setCashuWallet: (wallet, mints, relays) => {
        set({
          cashuWallet: wallet,
          cashuConnection: wallet
            ? {
                type: "cashu",
                mints,
                relays,
                connectedAt: Date.now(),
              }
            : null,
          activeWalletType: wallet ? "cashu" : get().activeWalletType,
        });
      },

      setActiveWalletType: (type) => {
        set({ activeWalletType: type });
      },

      disconnectNWC: () => {
        set({
          nwcWallet: null,
          nwcConnection: null,
          activeWalletType:
            get().activeWalletType === "nwc" ? null : get().activeWalletType,
        });
      },

      disconnectCashu: () => {
        set({
          cashuWallet: null,
          cashuConnection: null,
          activeWalletType:
            get().activeWalletType === "cashu" ? null : get().activeWalletType,
        });
      },

      getActiveWallet: () => {
        const state = get();
        if (state.activeWalletType === "nwc") return state.nwcWallet;
        if (state.activeWalletType === "cashu") return state.cashuWallet;
        return null;
      },
    }),
    {
      name: "wavefunc-wallet-storage",
      partialize: (state) => ({
        nwcConnection: state.nwcConnection,
        cashuConnection: state.cashuConnection,
        activeWalletType: state.activeWalletType,
      }),
    }
  )
);
