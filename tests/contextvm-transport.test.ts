import { expect, test } from "bun:test";
import { McpServer } from "@contextvm/mcp-sdk/server/mcp.js";
import {
  ApplesauceRelayPool,
  NostrServerTransport,
  PrivateKeySigner,
  EncryptionMode,
} from "@contextvm/sdk";
import {
  matchFilters,
  verifyEvent,
  type Event,
  type Filter,
} from "nostr-tools";
import type { ServerWebSocket } from "bun";
import { z } from "zod";
import { WavefuncMetadataServerClient } from "../src/ctxcn/WavefuncMetadataServerClient";
import { extractStreamMetadataInputSchema, extractStreamMetadataOutputSchema } from "../contextvm/schemas";

for (const encryptionMode of [EncryptionMode.DISABLED, EncryptionMode.REQUIRED])
  test(`ContextVM ${encryptionMode}: tool results, progress and errors over a local relay`, async () => {
    const peers = new Map<ServerWebSocket<unknown>, Map<string, Filter[]>>();
    const published: Event[] = [];
    const relay = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request, server) {
        if (server.upgrade(request)) return;
        return Response.json({ supported_nips: [1] });
      },
      websocket: {
        open(ws) {
          peers.set(ws, new Map());
        },
        close(ws) {
          peers.delete(ws);
        },
        message(ws, data) {
          const [type, id, ...filters] = JSON.parse(String(data));
          if (type === "REQ") {
            peers.get(ws)!.set(id, filters);
            ws.send(JSON.stringify(["EOSE", id]));
          }
          if (type === "CLOSE") peers.get(ws)!.delete(id);
          if (type === "EVENT") {
            expect(verifyEvent(id)).toBe(true);
            published.push(id);
            ws.send(JSON.stringify(["OK", id.id, true, ""]));
            for (const [peer, subscriptions] of peers)
              for (const [sub, filter] of subscriptions)
                if (matchFilters(filter, id))
                  peer.send(JSON.stringify(["EVENT", sub, id]));
          }
        },
      },
    });
    const url = `ws://127.0.0.1:${relay.port}`;
    const signer = new PrivateKeySigner("5".repeat(64));
    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool("extract_stream_metadata", {
      inputSchema: extractStreamMetadataInputSchema,
      outputSchema: extractStreamMetadataOutputSchema,
    }, async () => {
      await Bun.sleep(20);
      const output = { result: { song: "Pace or the Patience", artist: "Love of Diagrams", source: "ICY" as const,
        raw: { StreamTitle: "Love of Diagrams - Pace or the Patience", StreamUrl: undefined },
      } };
      return { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output };
    });
    server.registerTool(
      "search_artists",
      { inputSchema: { query: z.string(), limit: z.number().optional() } },
      async ({ query }) =>
        query === "fail"
          ? {
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "fixture failure" }),
                },
              ],
            }
          : {
              content: [{ type: "text", text: "ok" }],
              structuredContent: { result: [{ id: "test", name: query }] },
            },
    );
    server.registerTool(
      "prepare_download",
      { inputSchema: { videoId: z.string(), format: z.string().optional() } },
      async (_input, extra) => {
        if (extra._meta?.progressToken !== undefined)
          await extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken: extra._meta.progressToken,
              progress: 50,
              message: "Halfway",
            },
          });
        return {
          content: [{ type: "text", text: "ready" }],
          structuredContent: {
            tempId: "fixture",
            sha256: "a".repeat(64),
            size: 100,
            mimeType: "audio/mpeg",
          },
        };
      },
    );
    const pool = new ApplesauceRelayPool([url]);
    const transport = new NostrServerTransport({
      signer,
      relayHandler: pool,
      isPublicServer: false,
      encryptionMode,
    });
    let client: WavefuncMetadataServerClient | undefined;
    try {
      await server.connect(transport);
      client = new WavefuncMetadataServerClient({
        privateKey: "6".repeat(64),
        relays: [url],
        serverPubkey: await signer.getPublicKey(),
        encryptionMode,
      });
      // Call immediately: constructor connection must complete before dispatch.
      expect((await client.SearchArtists("WaveFunc")).result[0]?.name).toBe(
        "WaveFunc",
      );
      expect((await client.ExtractStreamMetadata("https://radio.example/bagel")).result.song).toBe("Pace or the Patience");
      // Let the native WebSocket exchange settle before entering Bun's matcher.
      // Promise rejection matchers can stall this exchange on Windows runners.
      const toolError = await client.SearchArtists("fail").then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(toolError).toBeInstanceOf(Error);
      expect((toolError as Error).message).toContain("fixture failure");
      const progress: number[] = [];
      expect(
        (
          await client.PrepareDownload("fixture", "audio", (p) =>
            progress.push(p.progress),
          )
        ).tempId,
      ).toBe("fixture");
      expect(progress).toContain(50);
      expect(
        published.some((e) =>
          encryptionMode === EncryptionMode.DISABLED
            ? e.kind === 25910
            : [1059, 21059].includes(e.kind),
        ),
      ).toBe(true);
      await client.disconnect();
      await expect(client.SearchArtists("closed")).rejects.toThrow("closed");
    } finally {
      await client?.disconnect();
      await server.close();
      await pool.disconnect();
      relay.stop(true);
    }
  }, 15000);
