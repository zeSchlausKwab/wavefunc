// ContextVM Metadata Server - Communicates via Nostr
import { NostrServerTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { ApplesauceRelayPool } from "@contextvm/sdk";
import { McpServer } from "@contextvm/mcp-sdk/server/mcp.js";
import { extractIcecastMetadata } from "./tools/stream-metadata.ts";
import {
  searchArtists,
  searchReleases,
  searchRecordings,
  searchLabels,
  searchRecordingsCombined,
  getMusicMetadataStats,
} from "./tools/musicbrainz.ts";
import { createStationObserverFromEnvironment } from "./observer/service.ts";
import {
  extractStreamMetadataInputSchema,
  extractStreamMetadataOutputSchema,
  searchArtistsInputSchema,
  searchArtistsOutputSchema,
  searchReleasesInputSchema,
  searchReleasesOutputSchema,
  searchRecordingsInputSchema,
  searchRecordingsOutputSchema,
  searchLabelsInputSchema,
  searchLabelsOutputSchema,
  searchRecordingsCombinedInputSchema,
  searchRecordingsCombinedOutputSchema,
} from "./schemas.ts";

// Configuration
const SERVER_PRIVATE_KEY =
  process.env.METADATA_SERVER_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000001"; // Dev key
const RELAYS = [
  process.env.RELAY_URL || "ws://localhost:3334",
  "wss://relay2.contextvm.org/",
];

const stationObserver = createStationObserverFromEnvironment({
  appRelay: RELAYS[0]!,
  observerPrivateKey: SERVER_PRIVATE_KEY,
});

type StreamMetadataResult = Awaited<ReturnType<typeof extractIcecastMetadata>>;

const STREAM_METADATA_CACHE_TTL_MS = 20_000;
const STREAM_METADATA_CACHE_MAX = 250;
const streamMetadataCache = new Map<
  string,
  { value: StreamMetadataResult; expiresAt: number }
>();
const streamMetadataInFlight = new Map<string, Promise<StreamMetadataResult>>();
let streamMetadataCacheHits = 0;
let streamMetadataCacheMisses = 0;

async function extractIcecastMetadataCached(
  url: string
): Promise<StreamMetadataResult> {
  const now = Date.now();
  const cached = streamMetadataCache.get(url);
  if (cached && cached.expiresAt > now) {
    streamMetadataCacheHits++;
    return cached.value;
  }

  const pending = streamMetadataInFlight.get(url);
  if (pending) {
    streamMetadataCacheHits++;
    return pending;
  }

  streamMetadataCacheMisses++;
  const promise = (async () => {
    const metadata = await extractIcecastMetadata(url);
    if (streamMetadataCache.size >= STREAM_METADATA_CACHE_MAX) {
      const oldestKey = streamMetadataCache.keys().next().value;
      if (oldestKey !== undefined) streamMetadataCache.delete(oldestKey);
    }
    streamMetadataCache.set(url, {
      value: metadata,
      expiresAt: Date.now() + STREAM_METADATA_CACHE_TTL_MS,
    });
    return metadata;
  })();

  streamMetadataInFlight.set(url, promise);
  try {
    return await promise;
  } finally {
    streamMetadataInFlight.delete(url);
  }
}

const serverStartedAt = Date.now();

async function main() {
  console.log("🎵 Starting ContextVM Metadata Server...\n");

  // 1. Setup Signer and Relay Pool
  const signer = new PrivateKeySigner(SERVER_PRIVATE_KEY);
  const relayPool = new ApplesauceRelayPool(RELAYS);
  const serverPubkey = await signer.getPublicKey();

  console.log(`📡 Server Public Key: ${serverPubkey}`);
  console.log(`🔌 Connecting to relays: ${RELAYS.join(", ")}...\n`);

  // 2. Create and Configure the MCP Server
  const mcpServer = new McpServer({
    name: "wavefunc-metadata-server",
    version: "1.0.0",
  });
  mcpServer.server.onerror = (error) => {
    console.error("ContextVM protocol error:", error);
  };

  // 3. Register Tool: Extract Stream Metadata
  mcpServer.registerTool(
    "extract_stream_metadata",
    {
      title: "Extract Stream Metadata",
      description:
        "Extracts 'now playing' metadata from Icecast/Shoutcast radio streams",
      inputSchema: extractStreamMetadataInputSchema,
      outputSchema: extractStreamMetadataOutputSchema,
    },
    async ({ url, stationAddress, sessionId, observedAt }) => {
      try {
        console.log(`🎧 Extracting metadata from: ${url}`);
        const metadata = await extractIcecastMetadataCached(url);

        try {
          await stationObserver.observeMetadata({
            stationAddress,
            sessionId,
            observedAt,
            streamUrl: url,
            metadata,
          });
        } catch (observerError) {
          // Listening telemetry is deliberately non-critical. Metadata remains
          // useful even if the observer relay or local database is unavailable.
          console.warn("Station observation failed:", observerError);
        }

        console.log(`✅ Extracted metadata:`, metadata);

        const output = { result: metadata };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ Failed to extract metadata: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 4. Register Tool: Search MusicBrainz Artists
  mcpServer.registerTool(
    "search_artists",
    {
      title: "Search MusicBrainz Artists",
      description:
        "Search for artists on MusicBrainz by name. Returns artist details including country, dates, disambiguation, and tags.",
      inputSchema: searchArtistsInputSchema,
      outputSchema: searchArtistsOutputSchema,
    },
    async ({ query, limit }) => {
      try {
        console.log(`🔍 Searching MusicBrainz artists: ${query}`);
        const results = await searchArtists(query, limit);

        const output = { result: results };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ Artist search failed: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 5. Register Tool: Search MusicBrainz Releases
  mcpServer.registerTool(
    "search_releases",
    {
      title: "Search MusicBrainz Releases",
      description:
        "Search for releases (albums) on MusicBrainz. Returns release details including artist, date, country, track count, and tags.",
      inputSchema: searchReleasesInputSchema,
      outputSchema: searchReleasesOutputSchema,
    },
    async ({ query, artist, limit }) => {
      try {
        console.log(
          `🔍 Searching MusicBrainz releases: ${query}${
            artist ? ` by ${artist}` : ""
          }`
        );
        const results = await searchReleases(query, limit, artist);

        const output = { result: results };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ Release search failed: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 6. Register Tool: Search MusicBrainz Recordings
  mcpServer.registerTool(
    "search_recordings",
    {
      title: "Search MusicBrainz Recordings",
      description:
        "Search for recordings (songs/tracks) on MusicBrainz. Returns recording details including artist, release, duration, and tags.",
      inputSchema: searchRecordingsInputSchema,
      outputSchema: searchRecordingsOutputSchema,
    },
    async ({ query, artist, limit }) => {
      try {
        console.log(
          `🔍 Searching MusicBrainz recordings: ${query}${
            artist ? ` by ${artist}` : ""
          }`
        );
        const results = await searchRecordings(query, artist, limit);

        const output = { result: results };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ Recording search failed: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 7. Register Tool: Search MusicBrainz Labels
  mcpServer.registerTool(
    "search_labels",
    {
      title: "Search MusicBrainz Labels",
      description:
        "Search for record labels on MusicBrainz. Returns label details including country, label code, type, and tags.",
      inputSchema: searchLabelsInputSchema,
      outputSchema: searchLabelsOutputSchema,
    },
    async ({ query, limit }) => {
      try {
        console.log(`🔍 Searching MusicBrainz labels: ${query}`);
        const results = await searchLabels(query, limit);

        const output = { result: results };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ Label search failed: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // 8. Register Tool: Search MusicBrainz Recordings (Combined/Advanced)
  mcpServer.registerTool(
    "search_recordings_combined",
    {
      title: "Search MusicBrainz Recordings (Advanced)",
      description:
        "Advanced combined search for recordings using multiple fields. Supports exact phrase matching (use quotes) and fuzzy search. Useful when you need precise results combining artist, recording title, release, ISRC, country, date, or duration. Example: recording='\"young men dead\"' artist='\"the black angels\"'",
      inputSchema: searchRecordingsCombinedInputSchema,
      outputSchema: searchRecordingsCombinedOutputSchema,
    },
    async ({
      recording,
      artist,
      release,
      isrc,
      country,
      date,
      duration,
      limit,
    }) => {
      try {
        const queryDesc = Object.entries({
          recording,
          artist,
          release,
          isrc,
          country,
          date,
          duration,
        })
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");

        console.log(`🔍 Combined MusicBrainz recording search: ${queryDesc}`);
        const results = await searchRecordingsCombined(
          { recording, artist, release, isrc, country, date, duration },
          limit
        );

        const output = { result: results };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(output, null, 2),
            },
          ],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ Combined recording search failed: ${error.message}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Configure the Nostr Server Transport
  const serverTransport = new NostrServerTransport({
    signer,
    relayHandler: relayPool,
    isPublicServer: true, // Announce this server on the Nostr network
    serverInfo: {
      name: "WaveFunc Metadata Server",
      website: "https://wavefunc.live",
      about:
        "Tools that are useful for internet radio stations, to help with metadata extraction and MusicBrainz lookups.",
      picture: "https://wavefunc.live/images/logo.png",
    },
  });

  // 6. Connect the server
  console.log("🔗 Connecting MCP server to Nostr transport...");
  await mcpServer.connect(serverTransport);

  console.log("✅ Server is running and listening for requests on Nostr");
  console.log("📋 Available tools:");
  console.log("   - extract_stream_metadata");
  console.log("   - search_artists");
  console.log("   - search_releases");
  console.log("   - search_recordings");
  console.log("   - search_recordings_combined (advanced multi-field search)");
  console.log("   - search_labels");
  console.log(`\n🔑 Client should use server pubkey: ${serverPubkey}`);
  console.log("💡 Press Ctrl+C to exit.\n");

  // Log when requests are received
  console.log("👂 Listening for tool requests...\n");

  void stationObserver.start().catch((error) => {
    console.error("❌ Station observer failed to start:", error);
  });

  // Optional local HTTP health endpoint for PM2 / monitoring probes.
  const healthPortRaw = process.env.CONTEXTVM_HEALTH_PORT ?? "3335";
  const healthPort = Number.parseInt(healthPortRaw, 10);
  if (
    process.env.NODE_ENV !== "test" &&
    Number.isFinite(healthPort) &&
    healthPort > 0
  ) {
    try {
      const healthServer = Bun.serve({
        hostname: "127.0.0.1",
        port: healthPort,
        fetch(req) {
          const { pathname } = new URL(req.url);
          if (pathname === "/healthz" || pathname === "/health") {
            return Response.json({
              ok: true,
              uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
              serverPubkey,
              relays: RELAYS,
              streamMetadataCache: {
                entries: streamMetadataCache.size,
                inFlight: streamMetadataInFlight.size,
                hits: streamMetadataCacheHits,
                misses: streamMetadataCacheMisses,
              },
              musicMetadata: getMusicMetadataStats(),
            });
          }
          return new Response("Not found", { status: 404 });
        },
      });
      console.log(
        `🩺 Health endpoint listening at http://127.0.0.1:${healthServer.port}/healthz`
      );
      const shutdown = () => {
        try {
          healthServer.stop(true);
        } catch {}
        process.exit(0);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    } catch (error) {
      console.warn(
        `⚠️  Could not bind ContextVM health server on 127.0.0.1:${healthPort}:`,
        error
      );
    }
  }
}

// Start the server
main().catch((error) => {
  console.error("❌ Failed to start metadata server:", error);
  process.exit(1);
});
