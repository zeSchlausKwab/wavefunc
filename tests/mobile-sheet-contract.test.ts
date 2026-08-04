import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "../src/components/FloatingPlayer.tsx"),
  "utf8",
);

describe("mobile player sheet", () => {
  test("opens roughly one-third taller by default", () => {
    expect(source).toContain("const PEEK_VH = 60;");
  });

  test("uses the grabber to toggle sheet size without closing the sheet", () => {
    const handler = source.slice(
      source.indexOf("const handleGrabberClick"),
      source.indexOf("const handleGrabberKeyDown"),
    );

    expect(handler).toContain('setSheetSnap("expanded")');
    expect(handler).toContain('setSheetSnap("peek")');
    expect(handler).not.toContain("closeSheet()");
    expect(source).toContain('className="w-full h-12 shrink-0');
  });
});
