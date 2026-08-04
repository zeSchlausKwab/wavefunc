import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventStore } from "applesauce-core";
import { of } from "rxjs";
import { renderToStaticMarkup } from "react-dom/server";
import { finalizeEvent } from "nostr-tools/pure";
import { requestEventsIntoStore } from "../src/lib/nostr/requestEvents";
import { SocialCount } from "../src/components/SocialCount";

const root = join(import.meta.dir, "..");

function fixtureEvent() {
  return finalizeEvent(
    {
      kind: 30078,
      created_at: 1,
      tags: [["d", "featured"]],
      content: "",
    },
    new Uint8Array(32).fill(1),
  );
}

describe("reload data regressions", () => {
  test("finite initial relay loads complete without waiting for an EOSE value", async () => {
    const eventStore = new EventStore();
    const event = fixtureEvent();
    const relayPool = {
      request: () => of(event),
    };

    await new Promise<void>((resolve, reject) => {
      requestEventsIntoStore(
        relayPool,
        eventStore,
        ["ws://localhost:3334"],
        [{ kinds: [30078] }],
      ).subscribe({ complete: resolve, error: reject });
    });

    expect(eventStore.hasEvent(event.id)).toBe(true);
  });

  test("favorite station resolution finishes from finite request completion", () => {
    const favoritesHook = readFileSync(
      join(root, "src/lib/hooks/useFavorites.ts"),
      "utf8",
    );
    const favoriteStations = favoritesHook.slice(
      favoritesHook.indexOf("export function useFavoriteStations"),
    );

    expect(favoriteStations).toContain("requestEventsIntoStore(");
    expect(favoriteStations).not.toContain('message === "EOSE"');
  });

  test("song lists and their tracks finish initial loads from finite requests", () => {
    const songFavorites = readFileSync(
      join(root, "src/lib/hooks/useSongFavorites.ts"),
      "utf8",
    );
    const crate = readFileSync(join(root, "src/routes/crate.tsx"), "utf8");
    const songResolution = crate.slice(
      crate.indexOf("function useSongsFromList"),
      crate.indexOf("// ─── Helpers"),
    );

    expect(songFavorites).toContain("requestEventsIntoStore(");
    expect(songFavorites).not.toContain('message === "EOSE"');
    expect(songResolution).toContain("requestEventsIntoStore(");
    expect(songResolution).not.toContain(
      "songs.length < addresses.length",
    );
  });

  test("station cards render retrieved social counts instead of tooltip-only values", () => {
    expect(renderToStaticMarkup(<SocialCount count={1} />)).toContain(">1<");
    expect(renderToStaticMarkup(<SocialCount count={1_200} />)).toContain(
      ">1.2K<",
    );
    expect(renderToStaticMarkup(<SocialCount count={0} />)).toBe("");

    const radioCard = readFileSync(
      join(root, "src/components/RadioCard.tsx"),
      "utf8",
    );
    expect(radioCard.match(/<SocialCount count=\{reactions\}/g)?.length).toBe(3);
    expect(radioCard.match(/<SocialCount count=\{zaps\}/g)?.length).toBe(3);
  });
});
