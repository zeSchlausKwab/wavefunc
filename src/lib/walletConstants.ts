/**
 * Default configuration for Cashu wallets (NIP-60)
 */

// Default Cashu mints for wallet creation
export const DEFAULT_CASHU_MINTS = [
  "https://mint.minibits.cash/Bitcoin",
  "https://mint.coinos.io",
  "https://mint.cypherflow.ai",
];

// Default relays for Cashu wallet token backup (kind 7375 events)
export const DEFAULT_CASHU_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.minibits.cash",
  "wss://relay.coinos.io",
  "wss://nos.lol",
  "wss://relay.wavefunc.live",
  "wss://relay.cypherflow.ai",
];
