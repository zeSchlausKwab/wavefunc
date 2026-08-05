import { describe, expect, test } from "bun:test";

import {
  buildShareSongNoteTemplate,
  parseSongEvent,
  SONG_KIND,
} from "../src/lib/nostr/domain";

const blossomUrl = "https://blossom.example/8f4d-racecar.mp4";

const downloadedSong = parseSongEvent({
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  kind: SONG_KIND,
  created_at: 1_786_000_000,
  content: "",
  sig: "c".repeat(128),
  tags: [
    ["d", "racecar-by-twin-tigers"],
    ["title", "Racecar"],
    ["c", "Twin Tigers", "artist"],
    ["r", blossomUrl],
    ["i", "youtube:dQw4w9WgXcQ"],
  ],
});

describe("downloaded song shares", () => {
  test("publishes a standalone text note containing its caption and media link", () => {
    const note = buildShareSongNoteTemplate({
      song: downloadedSong,
      content: "Saved this track with WaveFunc.",
      audioUrl: blossomUrl,
      hashtags: ["wavefunc", "tunestr"],
    });

    expect(note.kind).toBe(1);
    expect(note.content).toContain("Saved this track with WaveFunc.");
    expect(note.content).toContain(blossomUrl);
    expect(note.tags.some((tag) => tag[0] === "e" || tag[0] === "a")).toBe(false);
  });

  test("does not duplicate a media link already present in the note text", () => {
    const note = buildShareSongNoteTemplate({
      song: downloadedSong,
      content: `🎵 Racecar by Twin Tigers\n\n${blossomUrl}\n\n#wavefunc`,
      audioUrl: blossomUrl,
      hashtags: ["wavefunc"],
    });

    expect(note.content.match(new RegExp(blossomUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    expect(note.tags).toContainEqual(["r", blossomUrl]);
  });
});
