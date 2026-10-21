import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildShareStationNoteTemplate,
  STATION_KIND,
} from "../src/lib/nostr/domain";

const station = {
  kind: STATION_KIND,
  pubkey: "b".repeat(64),
  tags: [["d", "black-rhino-radio"]],
};
const stationUrl =
  "https://wavefunc.live/station/naddr1blackrhinoradio";
const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("station note shares", () => {
  test("publishes a kind-1 note with machine-readable station and URL references", () => {
    const note = buildShareStationNoteTemplate({
      station,
      content: `Listening to Black Rhino Radio on Wavefunc\n\n${stationUrl}`,
      url: stationUrl,
      hashtags: ["wavefunc", "radio"],
    });

    expect(note.kind).toBe(1);
    expect(note.content).toContain(stationUrl);
    expect(note.tags).toContainEqual([
      "a",
      `${STATION_KIND}:${station.pubkey}:black-rhino-radio`,
    ]);
    expect(note.tags).toContainEqual(["r", stationUrl]);
    expect(note.tags).toContainEqual(["t", "wavefunc"]);
    expect(note.tags).toContainEqual(["t", "radio"]);
  });

  test("adds a missing link once and normalizes duplicate hashtag inputs", () => {
    const note = buildShareStationNoteTemplate({
      station,
      content: "Tune in.",
      url: stationUrl,
      hashtags: ["#wavefunc", "wavefunc", ""],
    });

    expect(note.content).toBe(`Tune in.\n\n${stationUrl}`);
    expect(note.content.match(/https:\/\/wavefunc\.live/g)).toHaveLength(1);
    expect(note.tags.filter((tag) => tag[0] === "t")).toEqual([
      ["t", "wavefunc"],
    ]);
  });

  test("uses the same explicit share dialog in station cards and details", () => {
    const card = read("src/components/RadioCard.tsx");
    const detail = read("src/components/StationDetail.tsx");
    const dialog = read("src/components/StationShareDialog.tsx");

    for (const source of [card, detail]) {
      expect(source).toContain("StationShareDialog");
      expect(source).toContain("setShowShareDialog(true)");
    }
    expect(card).not.toContain("shareOrCopy");
    expect(detail).not.toContain("navigator.clipboard");
    expect(dialog).toContain("PUBLISH_TO_NOSTR");
    expect(dialog).toContain("COPY_LINK");
    expect(dialog).toContain("SHARE_VIA_DEVICE");
  });
});
