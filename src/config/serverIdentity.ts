import type { AppStage } from "./relayPolicy";

/**
 * Public identities are safe to bundle. Keeping them here prevents release
 * builds without CI overrides from silently querying a different observer.
 */
export const PRODUCTION_METADATA_SERVER_PUBKEY =
  "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2";

export const DEVELOPMENT_METADATA_SERVER_PUBKEY =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

export function defaultMetadataServerPubkey(stage: AppStage): string {
  return stage === "production"
    ? PRODUCTION_METADATA_SERVER_PUBKEY
    : DEVELOPMENT_METADATA_SERVER_PUBKEY;
}
