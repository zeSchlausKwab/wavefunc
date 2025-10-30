// ContextVM Client for Metadata Service
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { NostrClientTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { SimpleRelayPool } from "@contextvm/sdk";
import { config } from "../config/env";

let clientInstance: Client | null = null;
let clientTransport: NostrClientTransport | null = null;
let isConnecting = false;
let connectionPromise: Promise<Client> | null = null;

/**
 * Initialize the metadata client with connection reuse and timeout handling
 */
export async function initMetadataClient(): Promise<Client> {
  // Return existing client if already connected
  if (clientInstance) {
    return clientInstance;
  }

  // Wait for ongoing connection attempt
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // Start new connection
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      const signer = new PrivateKeySigner(config.metadataClientKey);
      const relayPool = new SimpleRelayPool([config.relayUrl]);

      clientTransport = new NostrClientTransport({
        signer,
        relayHandler: relayPool,
        serverPubkey: config.metadataServerPubkey,
      });

      clientInstance = new Client({
        name: "wavefunc-client",
        version: "1.0.0",
      });

      // Add timeout to connection attempt (30 seconds)
      const connectPromise = clientInstance.connect(clientTransport);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout after 30s")), 30000)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      return clientInstance;
    } catch (error) {
      // Reset state on failure
      clientInstance = null;
      clientTransport = null;
      throw error;
    } finally {
      isConnecting = false;
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Extract metadata from a stream URL with timeout
 */
export async function extractStreamMetadata(url: string, timeoutMs: number = 10000): Promise<any> {
  try {
    const client = await initMetadataClient();

    // Add timeout to the tool call
    const callPromise = client.callTool({
      name: "extract_stream_metadata",
      arguments: { url },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = (await Promise.race([callPromise, timeoutPromise])) as any;

    if (
      result.content &&
      Array.isArray(result.content) &&
      result.content.length > 0
    ) {
      const content = result.content[0];
      if (content?.text) {
        return JSON.parse(content.text);
      }
    }

    return { error: "No metadata returned" };
  } catch (error: any) {
    // Reset client on certain errors to force reconnection
    if (error.message?.includes("timeout") || error.message?.includes("closed")) {
      await closeMetadataClient();
    }

    return { error: error.message };
  }
}

/**
 * Search MusicBrainz for track information with timeout
 */
export async function searchMusicBrainz(params: {
  artist?: string;
  track?: string;
  query?: string;
}, timeoutMs: number = 10000): Promise<any[]> {
  try {
    const client = await initMetadataClient();

    // Add timeout to the tool call
    const callPromise = client.callTool({
      name: "musicbrainz_search",
      arguments: params,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = (await Promise.race([callPromise, timeoutPromise])) as any;

    if (
      result.content &&
      Array.isArray(result.content) &&
      result.content.length > 0
    ) {
      const content = result.content[0];
      if (content?.text) {
        return JSON.parse(content.text);
      }
    }

    return [];
  } catch (error: any) {
    // Reset client on certain errors to force reconnection
    if (error.message?.includes("timeout") || error.message?.includes("closed")) {
      await closeMetadataClient();
    }

    return [];
  }
}

/**
 * Close the metadata client connection
 */
export async function closeMetadataClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.close();
    clientInstance = null;
    clientTransport = null;
  }
}
