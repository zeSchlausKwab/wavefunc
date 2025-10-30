// ContextVM Client for Metadata Service
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { NostrClientTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { SimpleRelayPool } from "@contextvm/sdk";
import { config } from "../config/env";

/**
 * Get environment variable value (works in both Node and browser contexts)
 */
function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

// Server public key - should match the server's keypair
const METADATA_SERVER_PUBKEY =
  getEnv('METADATA_SERVER_PUBKEY') ||
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"; // Example pubkey from dev key

const CLIENT_PRIVATE_KEY =
  getEnv('METADATA_CLIENT_KEY') ||
  "0000000000000000000000000000000000000000000000000000000000000002"; // Dev client key

let clientInstance: Client | null = null;
let clientTransport: NostrClientTransport | null = null;

/**
 * Initialize the metadata client
 */
export async function initMetadataClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  console.log("🔌 Initializing metadata client...");

  const signer = new PrivateKeySigner(CLIENT_PRIVATE_KEY);
  const relayPool = new SimpleRelayPool([config.relayUrl]);

  clientTransport = new NostrClientTransport({
    signer,
    relayHandler: relayPool,
    serverPubkey: METADATA_SERVER_PUBKEY,
  });

  clientInstance = new Client({
    name: "wavefunc-client",
    version: "1.0.0",
  });

  await clientInstance.connect(clientTransport);
  console.log("✅ Metadata client connected");

  return clientInstance;
}

/**
 * Extract metadata from a stream URL
 */
export async function extractStreamMetadata(url: string): Promise<any> {
  try {
    const client = await initMetadataClient();

    const result = (await client.callTool({
      name: "extract_stream_metadata",
      arguments: { url },
    })) as any;

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
    console.error("Failed to extract stream metadata:", error);
    return { error: error.message };
  }
}

/**
 * Search MusicBrainz for track information
 */
export async function searchMusicBrainz(params: {
  artist?: string;
  track?: string;
  query?: string;
}): Promise<any[]> {
  try {
    const client = await initMetadataClient();

    const result = (await client.callTool({
      name: "musicbrainz_search",
      arguments: params,
    })) as any;

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
    console.error("Failed to search MusicBrainz:", error);
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
    console.log("🔌 Metadata client disconnected");
  }
}
