import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Tiny persisted store for the NIP-47 (Nostr Wallet Connect) connection
 * string. The actual pay-invoice flow lives in
 * `src/lib/nostr/nwc.ts` and uses the runtime RelayPool — this store only
 * remembers which wallet the user has paired so the ZapDialog can offer the
 * "Zap with NWC" path without re-prompting.
 *
 * The NIP-60 cashu wallet (via applesauce-wallet) is the primary wallet for
 * receiving and holding sats. NWC is kept as an optional secondary path for
 * users who already have an Alby/Mutiny/Coinos pairing they prefer.
 */
export type NWCConnection = {
  connectionString: string;
  connectedAt: number;
};

interface NWCConnectionState {
  connection: NWCConnection | null;
  setConnection: (connectionString: string) => void;
  disconnect: () => void;
}

export const useNWCConnectionStore = create<NWCConnectionState>()(
  persist(
    (set) => ({
      connection: null,
      setConnection: (connectionString) => {
        set({
          connection: {
            connectionString,
            connectedAt: Date.now(),
          },
        });
      },
      disconnect: () => set({ connection: null }),
    }),
    {
      name: "wavefunc:nwc-connection:v1",
    }
  )
);
