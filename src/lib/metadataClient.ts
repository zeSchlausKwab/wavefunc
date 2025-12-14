// Re-export the type-safe generated client
export { WavefuncMetadataServerClient } from "../ctxcn/WavefuncMetadataServerClient";
export type {
  ExtractStreamMetadataOutput,
  SearchArtistsOutput,
  SearchReleasesOutput,
  SearchRecordingsOutput,
  SearchLabelsOutput,
  SearchRecordingsCombinedOutput,
} from "../ctxcn/WavefuncMetadataServerClient";

import { WavefuncMetadataServerClient } from "../ctxcn/WavefuncMetadataServerClient";
import { config } from "../config/env";

/**
 * Default singleton instance of the metadata client
 * Initialized lazily on first use
 */
let defaultClient: WavefuncMetadataServerClient | null = null;

/**
 * Get or create the default metadata client instance
 */
export function getMetadataClient(): WavefuncMetadataServerClient {
  if (!defaultClient) {
    defaultClient = new WavefuncMetadataServerClient({
      privateKey: config.metadataClientKey,
      relays: [config.metadataRelayUrl], // Use ContextVM relay, not local Nostr relay
      serverPubkey: config.metadataServerPubkey,
    });
  }
  return defaultClient;
}
