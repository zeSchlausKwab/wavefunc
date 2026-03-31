// ContextVM Metadata Server - Communicates via Nostr
import { NostrServerTransport } from "@contextvm/sdk";
import { PrivateKeySigner } from "@contextvm/sdk";
import { ApplesauceRelayPool } from "@contextvm/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractIcecastMetadata } from "./tools/stream-metadata.ts";
import {
  searchArtists,
  searchReleases,
  searchRecordings,
  searchLabels,
  searchRecordingsCombined,
} from "./tools/musicbrainz.ts";
import { searchYouTube, prepareDownload, uploadToBlossomWithSignedEvent } from "./tools/ytdlp.ts";
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
  searchYouTubeInputSchema,
  searchYouTubeOutputSchema,
  prepareDownloadInputSchema,
  prepareDownloadOutputSchema,
  uploadToBlossomInputSchema,
  uploadToBlossomOutputSchema,
} from "./schemas.ts";

// Configuration
const SERVER_PRIVATE_KEY =
  process.env.METADATA_SERVER_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000001"; // Dev key
const BLOSSOM_SERVER =
  process.env.BLOSSOM_SERVER_URL || "https://blossom.band";
const RELAYS = [
  process.env.RELAY_URL || "ws://localhost:3334",
  "wss://relay2.contextvm.org/",
];

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
    async ({ url }) => {
      try {
        console.log(`🎧 Extracting metadata from: ${url}`);
        const metadata = await extractIcecastMetadata(url);

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

  // 9. Register Tool: Search YouTube
  mcpServer.registerTool(
    "search_youtube",
    {
      title: "Search YouTube",
      description:
        "Search YouTube for videos using yt-dlp. Returns video ID, title, duration, channel, and thumbnail. Use for finding audio sources to attach to songs.",
      inputSchema: searchYouTubeInputSchema,
      outputSchema: searchYouTubeOutputSchema,
    },
    async ({ query, limit }) => {
      try {
        console.log(`🎬 Searching YouTube: ${query} (limit=${limit ?? 5})`);
        const results = await searchYouTube(query, limit ?? 5);
        console.log(`✅ Found ${results.length} results`);
        const output = { results };
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error: any) {
        console.error(`❌ YouTube search failed: ${error.message}`);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
          isError: true,
        };
      }
    }
  );

  // 10a. Register Tool: Prepare Download (server-side yt-dlp, returns hash for client to sign)
  mcpServer.registerTool(
    "prepare_download",
    {
      title: "Prepare Media Download",
      description:
        "Downloads a video or audio track via yt-dlp and stores it temporarily. Returns a tempId and SHA-256 hash so the client can sign a BUD-01 upload auth event. Call upload_to_blossom next. Valid for 15 minutes. May take 30–120 seconds.",
      inputSchema: prepareDownloadInputSchema,
      outputSchema: prepareDownloadOutputSchema,
    },
    async ({ videoId, format }, extra) => {
      try {
        const progressToken = extra._meta?.progressToken;
        let progressCount = 0;
        const onProgress = async (message: string) => {
          if (progressToken === undefined) return;
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: { progressToken, progress: ++progressCount, message },
            } as any);
          } catch {}
        };

        const result = await prepareDownload(videoId, format ?? "audio", onProgress);
        console.log(`✅ Prepared: tempId=${result.tempId}, sha256=${result.sha256}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        console.error(`❌ prepare_download failed: ${error.message}`);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
          isError: true,
        };
      }
    }
  );

  // 10b. Register Tool: Upload to Blossom with client-signed auth event
  mcpServer.registerTool(
    "upload_to_blossom",
    {
      title: "Upload to Blossom",
      description:
        "Uploads a previously prepared file (from prepare_download) to a Blossom server using a client-signed BUD-01 kind 24242 auth event. The file is attributed to the client's Nostr key.",
      inputSchema: uploadToBlossomInputSchema,
      outputSchema: uploadToBlossomOutputSchema,
    },
    async ({ tempId, blossomUrl, signedAuthEvent }, extra) => {
      try {
        const progressToken = extra._meta?.progressToken;
        let progressCount = 0;
        const onProgress = async (message: string) => {
          if (progressToken === undefined) return;
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: { progressToken, progress: ++progressCount, message },
            } as any);
          } catch {}
        };

        const result = await uploadToBlossomWithSignedEvent(tempId, blossomUrl, signedAuthEvent, onProgress);
        console.log(`✅ Uploaded: ${result.url} (${result.size} bytes)`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error: any) {
        console.error(`❌ upload_to_blossom failed: ${error.message}`);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
          isError: true,
        };
      }
    }
  );

  // 11. Configure the Nostr Server Transport
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
  console.log("   - search_youtube");
  console.log("   - prepare_download");
  console.log("   - upload_to_blossom");
  console.log(`\n🔑 Client should use server pubkey: ${serverPubkey}`);
  console.log("💡 Press Ctrl+C to exit.\n");

  // Log when requests are received
  console.log("👂 Listening for tool requests...\n");
}

// Start the server
main().catch((error) => {
  console.error("❌ Failed to start metadata server:", error);
  process.exit(1);
});
