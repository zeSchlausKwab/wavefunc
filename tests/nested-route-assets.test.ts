import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStaticAssetPath } from "../src/lib/http/spaFallback";

describe("nested route assets", () => {
  test("loads entrypoints and icons from the site root", () => {
    const html = readFileSync(
      join(import.meta.dir, "../src/index.html"),
      "utf8",
    );

    // Bun resolves relative source entries and emits them using the build's
    // root publicPath. Absolute source entries are not resolvable by Bun.
    expect(html).toContain('src="./frontend.tsx"');
    expect(html).toContain('href="./favicon.ico"');

    const build = readFileSync(join(import.meta.dir, "../build.ts"), "utf8");
    expect(build).toContain('publicPath: "/"');
  });

  test("distinguishes missing assets from client-side routes", () => {
    expect(isStaticAssetPath("/browse/chunk-deadbeef.js")).toBe(true);
    expect(isStaticAssetPath("/images/station.webp")).toBe(true);
    expect(isStaticAssetPath("/browse/genres")).toBe(false);
    expect(isStaticAssetPath("/profile/npub1example")).toBe(false);
  });
});
