import { describe, expect, test } from "bun:test";
import { parseRouterSearch, stringifyRouterSearch } from "../src/lib/routerSearch";
import { genreSlug, genrePath, genreDisplayName, parseGenrePage, stationGenres } from "../src/lib/genres";

describe("public genre URLs", () => {
  test("groups normalized labels while keeping different punctuation and scripts distinct", () => {
    expect(genreSlug("  ROCK ")).toBe("rock");
    expect(genreSlug("Cafe\u0301  Rock")).toBe(genreSlug("Café rock"));
    expect(genreDisplayName("  drum  & Bass  ")).toBe("Drum & Bass");
    const labels = ["pop/rock", "pop rock", "pop-rock", "pop~2frock", "pop+rock", "pop%2Frock", "pop?rock"];
    expect(new Set(labels.map(genreSlug)).size).toBe(labels.length);
    const slug = genreSlug("Été / 日本語");
    const path = genrePath(slug, 2);
    expect(path).not.toContain(" ");
    expect(path.split("/")).toHaveLength(3);
    expect(decodeURIComponent(new URL(path, "https://wavefunc.live").pathname.slice("/genre/".length))).toBe(slug);
    expect(genreSlug(".")).toBe("~2e");
    expect(genreSlug("x\u0000y")).toBe("");
    expect(genreSlug("    ")).toBe("");
    expect(genreSlug("\ud800")).toBe("");
    expect(stationGenres(["Rock", "rock", "", "R&B"])).toEqual([{ slug: "rock", name: "Rock" }, { slug: "r~26b", name: "R&B" }]);
  });

  test("preserves literal GET syntax during router navigation for numeric genres and malformed pages", () => {
    for (const query of ["80", "true", "[]", '"a"', "R&B / 東京"]) {
      expect(parseRouterSearch(stringifyRouterSearch({ q: query })).q).toBe(query);
    }
    expect(parseRouterSearch("?page=1e2").page).toBe("1e2");
    expect(parseRouterSearch("?page=1&page=2").page).toEqual(["1", "2"]);
  });

  test("long labels still have distinct sitemap-safe URLs", () => {
    const long = "東京".repeat(500);
    expect(genreSlug(long)).toMatch(/^~h[0-9a-f]{64}$/);
    expect(genreSlug(long)).not.toBe(genreSlug(long + "1"));
  });

  test("pagination accepts only positive integer pages and links back to the original first page", () => {
    expect(parseGenrePage(undefined)).toBe(1);
    expect(parseGenrePage("2")).toBe(2);
    expect(parseGenrePage(3)).toBe(3);
    for (const value of [0, -1, "", "03", "+1", "1.5", "2e1", ["2"], true, 2 ** 54]) {
      expect(parseGenrePage(value)).toBeUndefined();
    }
    expect(genrePath("rock", 1)).toBe("/genre/rock");
    expect(genrePath("rock", 3)).toBe("/genre/rock?page=3");
  });
});
