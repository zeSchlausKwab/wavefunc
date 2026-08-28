import { afterEach, describe, expect, test } from "bun:test";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

describe("stream metadata timeout cleanup", () => {
  test("aborts the request and cancels the stream when ICY metadata never arrives", async () => {
    const streamUrl = "https://radio.example/live";
    let streamRequestSignal: AbortSignal | undefined;
    let streamCancelCount = 0;
    let streamGetCount = 0;
    let streamHeadCount = 0;

    globalThis.setTimeout = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: any[]
    ) =>
      originalSetTimeout(
        handler,
        typeof timeout === "number" && timeout >= 10_000 ? 5 : timeout,
        ...args,
      )) as typeof setTimeout;

    globalThis.fetch = (async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === streamUrl && method === "GET") {
        streamGetCount += 1;

        // The initial generic probe should finish immediately without metadata.
        if (streamGetCount === 1) {
          return new Response(new Uint8Array(), {
            headers: { "content-type": "application/octet-stream" },
          });
        }

        streamRequestSignal = init?.signal ?? undefined;
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              streamCancelCount += 1;
            },
          }),
          { headers: { "icy-metaint": "16" } },
        );
      }

      if (url === streamUrl && method === "HEAD") {
        streamHeadCount += 1;
        if (streamHeadCount === 1) return new Response(null, { status: 404 });
        return new Response(null, { headers: { "icy-metaint": "16" } });
      }

      // None of the common Icecast JSON endpoints are available in this fixture.
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    const { extractIcecastMetadata } = await import(
      "../contextvm/tools/stream-metadata.ts"
    );

    await extractIcecastMetadata(streamUrl, { enrichWithMusicBrainz: false });

    expect(streamGetCount).toBe(2);
    expect(streamRequestSignal?.aborted).toBe(true);
    expect(streamCancelCount).toBe(1);
  });
});
