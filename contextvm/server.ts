// ContextVM Metadata Server - Communicates via Nostr
import { NostrServerTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { SimpleRelayPool } from "@contextvm/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { extractIcecastMetadata } from "./tools/stream-metadata.ts";
import { searchMusicBrainz } from "./tools/musicbrainz.ts";

// Configuration
const SERVER_PRIVATE_KEY =
  process.env.METADATA_SERVER_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000001"; // Dev key
const RELAYS = [process.env.RELAY_URL || "ws://localhost:3334"];

async function main() {
  console.log("🎵 Starting ContextVM Metadata Server...\n");

  // 1. Setup Signer and Relay Pool
  const signer = new PrivateKeySigner(SERVER_PRIVATE_KEY);
  const relayPool = new SimpleRelayPool(RELAYS);
  const serverPubkey = await signer.getPublicKey();

  console.log(`📡 Server Public Key: ${serverPubkey}`);
  console.log(`🔌 Connecting to relays: ${RELAYS.join(", ")}...\n`);

  // 2. Create and Configure the MCP Server
  const mcpServer = new McpServer({
    name: "wavefunc-metadata-server",
    version: "1.0.0",
  });

  // 3. Register Tool: Extract Stream Metadata
  mcpServer.registerTool(
    "extract_stream_metadata",
    {
      title: "Extract Stream Metadata",
      description:
        "Extracts 'now playing' metadata from Icecast/Shoutcast radio streams",
      inputSchema: { url: z.string() },
    },
    async ({ url }) => {
      try {
        console.log(`🎧 Extracting metadata from: ${url}`);
        const metadata = await extractIcecastMetadata(url);

        console.log(`✅ Extracted metadata:`, metadata);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(metadata, null, 2),
            },
          ],
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

  // 4. Register Tool: MusicBrainz Search
  mcpServer.registerTool(
    "musicbrainz_search",
    {
      title: "MusicBrainz Search",
      description:
        "Search MusicBrainz for detailed track information (artist, album, release date, etc.)",
      inputSchema: {
        artist: z.string().optional(),
        track: z.string().optional(),
        query: z.string().optional(),
      },
    },
    async ({ artist, track, query }) => {
      try {
        console.log(
          `🔍 Searching MusicBrainz: ${artist || ""} - ${track || ""} ${
            query || ""
          }`
        );
        const results = await searchMusicBrainz({ artist, track, query });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      } catch (error: any) {
        console.error(`❌ MusicBrainz search failed: ${error.message}`);
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

  // 5. Configure the Nostr Server Transport
  const serverTransport = new NostrServerTransport({
    signer,
    relayHandler: relayPool,
    isPublicServer: true, // Announce this server on the Nostr network
    serverInfo: {
      name: "WaveFunc Metadata Server",
    },
  });

  // 6. Connect the server
  await mcpServer.connect(serverTransport);

  console.log("✅ Server is running and listening for requests on Nostr");
  console.log("📋 Available tools:");
  console.log("   - extract_stream_metadata");
  console.log("   - musicbrainz_search");
  console.log("\n💡 Press Ctrl+C to exit.\n");
}

// Start the server
main().catch((error) => {
  console.error("❌ Failed to start metadata server:", error);
  process.exit(1);
});
