import { expect, test } from "bun:test";
import {
  ListeningStatusPublisher,
  listeningTemplate,
} from "../src/lib/nostr/listeningStatus";
test("music status expires after five minutes and clearing retains the replaceable identifier", () => {
  expect(
    listeningTemplate({ title: "Track", artist: "Artist" }, 100),
  ).toMatchObject({
    kind: 30315,
    content: "Artist - Track",
    tags: [
      ["d", "music"],
      ["expiration", "400"],
    ],
  });
  expect(listeningTemplate(null, 101).content).toBe("");
});
test("disable during a signer prompt prevents stale publication and clears in order", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const sent: string[] = [];
  const publisher = new ListeningStatusPublisher(
    async (event, current) => {
      if (event.content) await gate;
      if (current()) sent.push(event.content);
    },
    () => 100,
  );
  const pending = publisher.update({ title: "Old track" });
  await Promise.resolve();
  await Promise.resolve();
  const stopped = publisher.stop();
  release();
  await pending;
  await stopped;
  expect(sent).toEqual([""]);
  await publisher.update({ title: "No longer opted in" });
  expect(sent).toEqual([""]);
});
test("stop clears an uncertain publication even when its response fails", async () => {
  const sent: string[] = [];
  const publisher = new ListeningStatusPublisher(
    async (event) => {
      sent.push(event.content);
      if (event.content) throw new Error("offline");
    },
    () => 100,
  );
  await expect(publisher.update({ title: "Track" })).rejects.toThrow("offline");
  await publisher.stop();
  expect(sent).toEqual(["Track", ""]);
});

test("a track immediately following an idle update is not lost", async () => {
  const sent: string[] = [];
  const publisher = new ListeningStatusPublisher(
    async (event) => {
      sent.push(event.content);
    },
    () => 100,
  );
  void publisher.update(null);
  await publisher.update({ title: "New track" });
  expect(sent).toEqual(["New track"]);
});
