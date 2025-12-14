import { NDKNWCWallet } from "@nostr-dev-kit/wallet";
import { useWalletStore } from "../stores/walletStore";

const NWC_TIMEOUT_MS = 15000;
const BALANCE_FETCH_DELAY_INITIAL_MS = 3000;
const BALANCE_FETCH_DELAY_RESTORE_MS = 4000;

/**
 * Parse the NWC connection string and add the relay to NDK's pool
 */
export function ensureNWCRelayInPool(ndk: any, connectionString: string): void {
  try {
    const url = new URL(connectionString);
    const relayUrl = url.searchParams.get("relay");

    if (relayUrl && !Array.from(ndk.pool.relays.keys()).includes(relayUrl)) {
      ndk.addExplicitRelay(relayUrl);
    }
  } catch (err) {
    console.error("Failed to parse NWC relay URL:", err);
  }
}

/**
 * Create and initialize an NWC wallet instance
 */
export function createNWCWallet(
  ndk: any,
  connectionString: string
): NDKNWCWallet {
  const wallet = new NDKNWCWallet(ndk, {
    pairingCode: connectionString,
    timeout: NWC_TIMEOUT_MS,
  });

  // Assign to NDK instance
  ndk.wallet = wallet as any;

  // Set up event listeners
  (wallet as any).on("timeout", (method: string) => {
    console.warn("NWC wallet operation timed out:", method);
  });

  return wallet;
}

/**
 * Fetch wallet balance asynchronously with a delay to allow relay connection
 */
export function fetchBalanceAsync(wallet: NDKNWCWallet, delayMs: number): void {
  setTimeout(() => {
    if (wallet.updateBalance) {
      wallet
        .updateBalance()
        .then(() => {
          const balance = wallet.balance;
          if (balance && typeof balance.amount === "number") {
            useWalletStore.getState().updateNWCBalance(balance.amount);
          }
        })
        .catch((err) => {
          console.warn("Could not fetch wallet balance:", err);
        });
    }
  }, delayMs);
}

/**
 * Initialize an NWC wallet connection
 */
export function initializeNWCWallet(
  ndk: any,
  connectionString: string
): NDKNWCWallet {
  // Ensure the NWC relay is in the pool
  ensureNWCRelayInPool(ndk, connectionString);

  // Create and setup the wallet
  const wallet = createNWCWallet(ndk, connectionString);

  // Fetch balance after initial delay
  fetchBalanceAsync(wallet, BALANCE_FETCH_DELAY_INITIAL_MS);

  return wallet;
}

/**
 * Restore an NWC wallet from localStorage on app startup
 */
export function restoreNWCWallet(
  ndk: any,
  connectionString: string
): NDKNWCWallet {
  // Ensure the NWC relay is in the pool
  ensureNWCRelayInPool(ndk, connectionString);

  // Create and setup the wallet
  const wallet = createNWCWallet(ndk, connectionString);

  // Fetch balance after longer delay (cold start)
  fetchBalanceAsync(wallet, BALANCE_FETCH_DELAY_RESTORE_MS);

  return wallet;
}
