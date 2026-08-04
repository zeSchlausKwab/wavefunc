import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("applesauce refactor contracts", () => {
  test("keeps every Applesauce package on the same v6 major", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    const versions = Object.entries(pkg.dependencies).filter(([name]) =>
      name.startsWith("applesauce-"),
    );

    expect(versions.length).toBeGreaterThan(0);
    for (const [name, version] of versions) {
      expect(version, `${name} must stay on the v6 package family`).toMatch(
        /^\^6\./,
      );
    }
  });

  test("owns the v6 NutWallet lifecycle at the account boundary", () => {
    const runtime = read("src/lib/nostr/runtime.tsx");

    expect(runtime).toContain("new NutWallet({");
    expect(runtime).toContain("await instance.start()");
    expect(runtime).toContain("instance.stop()");
    expect(runtime).not.toContain("FactoryProvider");
  });

  test("navigation treats parsed song lists as data instead of legacy classes", () => {
    const navigation = read("src/components/NavigationItems.tsx");

    expect(navigation).toContain("getSongListSongCount(list)");
    expect(navigation).not.toContain("list.getSongCount()");
    expect(navigation).not.toContain("l.getSongCount()");
  });
});
