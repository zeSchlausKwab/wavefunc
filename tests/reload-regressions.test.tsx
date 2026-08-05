import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialCount } from "../src/components/SocialCount";

const root = join(import.meta.dir, "..");

describe("reload data regressions", () => {
  test("favorite station resolution uses the shared finite query registry", () => {
    const favoritesHook = readFileSync(
      join(root, "src/lib/hooks/useFavorites.ts"),
      "utf8",
    );
    const favoriteStations = favoritesHook.slice(
      favoritesHook.indexOf("export function useFavoriteStations"),
    );

    expect(favoriteStations).toContain("useAppDataTimeline(");
    expect(favoriteStations).not.toContain('message === "EOSE"');
  });

  test("song lists and their tracks use the shared finite query registry", () => {
    const songFavorites = readFileSync(
      join(root, "src/lib/hooks/useSongFavorites.ts"),
      "utf8",
    );
    const crate = readFileSync(join(root, "src/routes/crate.tsx"), "utf8");
    const songResolution = crate.slice(
      crate.indexOf("function useSongsFromList"),
      crate.indexOf("// ─── Helpers"),
    );

    expect(songFavorites).toContain("useAppDataTimeline(filters)");
    expect(songFavorites).not.toContain('message === "EOSE"');
    expect(songResolution).toContain("useAppDataTimeline(");
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
