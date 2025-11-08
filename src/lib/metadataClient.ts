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
        setTimeout(
          () => reject(new Error("Connection timeout after 30s")),
          30000
        )
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
export async function extractStreamMetadata(
  url: string,
  timeoutMs: number = 10000
): Promise<any> {
  try {
    const client = await initMetadataClient();

    // Add timeout to the tool call
    const callPromise = client.callTool({
      name: "extract_stream_metadata",
      arguments: { url },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
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
    if (
      error.message?.includes("timeout") ||
      error.message?.includes("closed")
    ) {
      await closeMetadataClient();
    }

    return { error: error.message };
  }
}

/**
 * Legacy search function for backward compatibility
 * Searches across multiple entity types and returns combined results
 * @deprecated Use searchArtists, searchReleases, or searchRecordings directly
 */
export async function searchMusicBrainz(
  params: {
    artist?: string;
    track?: string;
    query?: string;
  },
  timeoutMs: number = 10000
): Promise<any[]> {
  try {
    // If both artist and track are provided, search recordings
    if (params.artist && params.track) {
      return await searchRecordings(params.track, params.artist, 10, timeoutMs);
    }

    // If only artist is provided, search artists
    if (params.artist && !params.track) {
      return await searchArtists(params.artist, 10, timeoutMs);
    }

    // If only track is provided, search recordings
    if (params.track && !params.artist) {
      return await searchRecordings(params.track, undefined, 10, timeoutMs);
    }

    // If query is provided, search all entity types and combine
    if (params.query) {
      const [artists, releases, recordings] = await Promise.all([
        searchArtists(params.query, 3, timeoutMs),
        searchReleases(params.query, undefined, 3, timeoutMs),
        searchRecordings(params.query, undefined, 4, timeoutMs),
      ]);

      // Combine and sort by score
      const combined = [...artists, ...releases, ...recordings];
      combined.sort((a: any, b: any) => b.score - a.score);
      return combined.slice(0, 10);
    }

    return [];
  } catch (error: any) {
    console.error("MusicBrainz search error:", error);
    return [];
  }
}

/**
 * Search MusicBrainz for artists
 */
export async function searchArtists(
  query: string,
  limit: number = 10,
  timeoutMs: number = 10000
): Promise<any[]> {
  try {
    const client = await initMetadataClient();

    const callPromise = client.callTool({
      name: "search_artists",
      arguments: { query, limit },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
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
    if (
      error.message?.includes("timeout") ||
      error.message?.includes("closed")
    ) {
      await closeMetadataClient();
    }
    return [];
  }
}

/**
 * Search MusicBrainz for releases (albums)
 */
export async function searchReleases(
  query: string,
  artist?: string,
  limit: number = 10,
  timeoutMs: number = 10000
): Promise<any[]> {
  try {
    const client = await initMetadataClient();

    const callPromise = client.callTool({
      name: "search_releases",
      arguments: { query, artist, limit },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
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
    if (
      error.message?.includes("timeout") ||
      error.message?.includes("closed")
    ) {
      await closeMetadataClient();
    }
    return [];
  }
}

/**
 * Search MusicBrainz for recordings (songs/tracks)
 */
export async function searchRecordings(
  query: string,
  artist?: string,
  limit: number = 10,
  timeoutMs: number = 10000
): Promise<any[]> {
  try {
    const client = await initMetadataClient();

    const callPromise = client.callTool({
      name: "search_recordings",
      arguments: { query, artist, limit },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
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
    if (
      error.message?.includes("timeout") ||
      error.message?.includes("closed")
    ) {
      await closeMetadataClient();
    }
    return [];
  }
}

/**
 * Search MusicBrainz for labels (record labels)
 */
export async function searchLabels(
  query: string,
  limit: number = 10,
  timeoutMs: number = 10000
): Promise<any[]> {
  try {
    const client = await initMetadataClient();

    const callPromise = client.callTool({
      name: "search_labels",
      arguments: { query, limit },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool call timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
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
    if (
      error.message?.includes("timeout") ||
      error.message?.includes("closed")
    ) {
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
