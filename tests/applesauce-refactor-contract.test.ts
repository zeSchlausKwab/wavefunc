import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("applesauce refactor contracts", () => {
  test("navigation treats parsed song lists as data instead of legacy classes", () => {
    const navigation = read("src/components/NavigationItems.tsx");

    expect(navigation).toContain("getSongListSongCount(list)");
    expect(navigation).not.toContain("list.getSongCount()");
    expect(navigation).not.toContain("l.getSongCount()");
  });
});
