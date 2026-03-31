import { DEV_ADMIN_PUBKEY, isDevelopmentEnvironment } from "./nostr";

/**
 * Hardcoded admin public keys (hex).
 * These users can publish admin feature events that appear on the landing page.
 */
const PROD_ADMIN_PUBKEYS = [
  "210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2",
];

export const ADMIN_PUBKEYS: string[] = isDevelopmentEnvironment()
  ? [DEV_ADMIN_PUBKEY, ...PROD_ADMIN_PUBKEYS]
  : PROD_ADMIN_PUBKEYS;

export function isAdmin(pubkey: string | undefined): boolean {
  if (!pubkey) return false;
  return ADMIN_PUBKEYS.includes(pubkey);
}
