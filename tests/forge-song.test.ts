import { describe, expect, test } from "bun:test";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { forgeAndFavoriteSong } from "../src/lib/nostr/forgeSong";
import {
  getSongAddressForPubkey,
  parseSongEvent,
  SONG_KIND,
} from "../src/lib/nostr/domain";

const key = new Uint8Array(32).fill(7);

function songEvent() {
  return finalizeEvent(
    {
      kind: SONG_KIND,
      created_at: 1,
      content: "",
      tags: [
        ["d", "dreamwaves-by-vogel"],
        ["title", "Dreamwaves"],
        ["c", "Vogel", "artist"],
      ],
    },
    key,
  );
}

describe("forged song persistence", () => {
  test("favourites an existing song before acquiring its media", async () => {
    const calls: string[] = [];
    const source = parseSongEvent(songEvent());

    const result = await forgeAndFavoriteSong({
      song: source,
      videoId: "RSOA00NFs7k",
      async favorite(address) {
        calls.push(`favorite:${address}`);
      },
      async acquireMedia() {
        calls.push("acquire");
        return { url: "https://blossom.example/dreamwaves.mp4" };
      },
      async publish(template) {
        calls.push("publish-update");
        return finalizeEvent(
          { ...template, created_at: 2 },
          key,
        );
      },
    });

    expect(calls).toEqual([
      `favorite:${source.address}`,
      "acquire",
      "publish-update",
    ]);
    expect(result.address).toBe(source.address);
    expect(result.audioUrl).toBe("https://blossom.example/dreamwaves.mp4");
    expect(result.youtubeId).toBe("RSOA00NFs7k");
  });

  test("publishes a new song, favourites it, then acquires its media", async () => {
    const calls: string[] = [];
    const expectedAddress = getSongAddressForPubkey(
      "dreamwaves-by-vogel",
      getPublicKey(key),
    );
    let publishedAt = 1;

    const result = await forgeAndFavoriteSong({
      metadata: { song: "Dreamwaves", artist: "Vogel" },
      videoId: "RSOA00NFs7k",
      async favorite(address) {
        calls.push(`favorite:${address}`);
      },
      async acquireMedia() {
        calls.push("acquire");
        return { url: "https://blossom.example/dreamwaves.mp4" };
      },
      async publish(template) {
        const isUpdate = template.tags.some((tag) => tag[0] === "r");
        calls.push(isUpdate ? "publish-update" : "publish-base");
        return finalizeEvent(
          { ...template, created_at: publishedAt++ },
          key,
        );
      },
    });

    expect(calls).toEqual([
      "publish-base",
      `favorite:${expectedAddress}`,
      "acquire",
      "publish-update",
    ]);
    expect(result.address).toBe(expectedAddress);
    expect(result.audioUrl).toBe("https://blossom.example/dreamwaves.mp4");
  });

  test("keeps the favourite when media acquisition fails", async () => {
    const calls: string[] = [];
    const source = parseSongEvent(songEvent());

    await expect(
      forgeAndFavoriteSong({
        song: source,
        videoId: "RSOA00NFs7k",
        async favorite(address) {
          calls.push(`favorite:${address}`);
        },
        async acquireMedia() {
          calls.push("acquire");
          throw new Error("Download was blocked");
        },
        async publish() {
          calls.push("publish-update");
          throw new Error("The update must not be published");
        },
      }),
    ).rejects.toThrow("Download was blocked");

    expect(calls).toEqual([`favorite:${source.address}`, "acquire"]);
  });
});
