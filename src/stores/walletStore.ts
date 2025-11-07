import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NDKWallet } from "@nostr-dev-kit/wallet";

export interface WalletConnection {
  type: "nwc" | "cashu";
  connectionString?: string; // For NWC
  mints?: string[]; // For Cashu
  relays?: string[]; // For Cashu
  primaryMint?: string; // For Cashu - the main mint used for deposits
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

  // Balance tracking
  cashuBalance: number;
  nwcBalance: number;

  // Actions
  setNWCWallet: (wallet: NDKWallet | null, connectionString?: string) => void;
  setCashuWallet: (
    wallet: NDKWallet | null,
    mints?: string[],
    relays?: string[],
    primaryMint?: string
  ) => void;
  updateCashuConnection: (
    mints: string[],
    relays: string[],
    primaryMint?: string
  ) => void;
  setActiveWalletType: (type: "nwc" | "cashu" | null) => void;
  disconnectNWC: () => void;
  disconnectCashu: () => void;
  getActiveWallet: () => NDKWallet | null;
  updateCashuBalance: (balance: number) => void;
  updateNWCBalance: (balance: number) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      nwcWallet: null,
      cashuWallet: null,
      activeWalletType: null,
      nwcConnection: null,
      cashuConnection: null,
      cashuBalance: 0,
      nwcBalance: 0,

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

        // Update balance from wallet if available
        if (wallet && wallet.balance) {
          const balance = wallet.balance;
          if (balance && typeof balance.amount === "number") {
            get().updateNWCBalance(balance.amount);
          }
        }
      },

      setCashuWallet: (wallet, mints, relays, primaryMint) => {
        set({
          cashuWallet: wallet,
          cashuConnection: wallet
            ? {
                type: "cashu",
                mints,
                relays,
                primaryMint: primaryMint || mints?.[0],
                connectedAt: Date.now(),
              }
            : null,
          activeWalletType: wallet ? "cashu" : get().activeWalletType,
        });
      },

      updateCashuConnection: (mints, relays, primaryMint) => {
        const currentConnection = get().cashuConnection;
        if (currentConnection) {
          set({
            cashuConnection: {
              ...currentConnection,
              mints,
              relays,
              primaryMint: primaryMint || mints[0],
            },
          });
        }
      },

      setActiveWalletType: (type) => {
        set({ activeWalletType: type });
      },

      disconnectNWC: () => {
        set({
          nwcWallet: null,
          nwcConnection: null,
          nwcBalance: 0,
          activeWalletType:
            get().activeWalletType === "nwc" ? null : get().activeWalletType,
        });
      },

      disconnectCashu: () => {
        set({
          cashuWallet: null,
          cashuConnection: null,
          cashuBalance: 0,
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

      updateCashuBalance: (balance) => {
        set({ cashuBalance: balance });
      },

      updateNWCBalance: (balance) => {
        set({ nwcBalance: balance });
      },
    }),
    {
      name: "wavefunc-wallet-storage",
      partialize: (state) => ({
        nwcConnection: state.nwcConnection,
        cashuConnection: state.cashuConnection,
        activeWalletType: state.activeWalletType,
        cashuBalance: state.cashuBalance,
        nwcBalance: state.nwcBalance,
      }),
    }
  )
);
