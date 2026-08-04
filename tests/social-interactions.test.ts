import { describe, expect, test } from "bun:test";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { summarizeSocialInteractions } from "../src/lib/nostr/social";

function event(
  id: string,
  kind: number,
  pubkey: string,
  tags: string[][] = [],
): NostrEvent {
  return {
    id,
    kind,
    pubkey,
    tags,
    content: "",
    created_at: 1,
    sig: "0".repeat(128),
  };
}

describe("station social interaction summaries", () => {
  test("deduplicates likes by pubkey and counts both zap standards", () => {
    const current = "a".repeat(64);
    const other = "b".repeat(64);
    const summary = summarizeSocialInteractions(
      [
        event("1", 7, current),
        event("2", 7, current),
        event("3", 7, other),
        event("4", 9735, other, [
          ["description", JSON.stringify({ pubkey: current })],
        ]),
        event("5", 9321, current),
        event("6", 1111, current),
      ],
      current,
    );

    expect(summary).toEqual({
      reactions: 2,
      zaps: 2,
      comments: 1,
      userHasReacted: true,
      userHasZapped: true,
      userHasCommented: true,
    });
  });
});
