import { describe, expect, test } from "bun:test";
import { nip46ClientName } from "../src/lib/nostr/nip46";

describe("NIP-46 client name", () => {
  test("appends a human-readable platform to production names", () => {
    expect(nip46ClientName("web", true)).toBe("Wavefunc Radio · Web");
    expect(nip46ClientName("android", true)).toBe(
      "Wavefunc Radio · Android",
    );
    expect(nip46ClientName("macos", true)).toBe("Wavefunc Radio · macOS");
    expect(nip46ClientName("windows", true)).toBe(
      "Wavefunc Radio · Windows",
    );
    expect(nip46ClientName("linux", true)).toBe("Wavefunc Radio · Linux");
    expect(nip46ClientName("ios", true)).toBe("Wavefunc Radio · iOS");
  });

  test("keeps the environment marker before the appended platform", () => {
    expect(nip46ClientName("android", false)).toBe(
      "Wavefunc Radio DEV · Android",
    );
  });
});
