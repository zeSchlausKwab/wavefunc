import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNavigationItems } from "../src/config/navigation";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("shared app navigation", () => {
  test("exposes music lookup consistently on desktop and mobile", () => {
    for (const surface of ["desktop", "mobile"] as const) {
      const lookup = getNavigationItems(surface).find(
        (item) => item.to === "/musicbrainz",
      );

      expect(lookup).toMatchObject({
        label: "LOOKUP",
        icon: "manage_search",
      });
    }
  });

  test("preserves surface-specific admin and download behavior", () => {
    expect(getNavigationItems("desktop").some((item) => item.to === "/admin"))
      .toBe(false);
    expect(
      getNavigationItems("desktop", true).some((item) => item.to === "/admin"),
    ).toBe(true);
    expect(getNavigationItems("mobile", true).some((item) => item.to === "/admin"))
      .toBe(false);
    expect(getNavigationItems("mobile").some((item) => item.to === "/apps"))
      .toBe(true);
    expect(
      getNavigationItems("desktop-action").some((item) => item.to === "/apps"),
    ).toBe(true);
  });

  test("both navigation surfaces consume the shared descriptor", () => {
    expect(read("src/components/FloatingHeader.tsx")).toContain(
      'getNavigationItems("desktop", adminUser)',
    );
    expect(read("src/components/NavigationItems.tsx")).toContain(
      'getNavigationItems("mobile")',
    );
  });
});
