import { afterEach, expect, spyOn, test } from "bun:test";
import * as metadataClient from "../src/ctxcn/WavefuncMetadataServerClient";
import { parseStationEvent } from "../src/lib/nostr/domain";
import { idleState, playingState } from "../src/lib/player/state";
import { installMetadataSubscription, useMetadataStore } from "../src/stores/metadataStore";
import { usePlayerStore } from "../src/stores/playerStore";

const station = parseStationEvent({
  id: "1".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128),
  kind: 31237, created_at: 1_700_000_000,
  tags: [["d", "bagel"], ["name", "BAGeL RADIO"]],
  content: JSON.stringify({ description: "Fixture", streams: [{ url: "https://radio.example/bagel", format: "audio/mpeg" }] }),
});

const disposals: Array<() => void> = [];
afterEach(() => {
  while (disposals.length) disposals.pop()?.();
  usePlayerStore.setState({ state: idleState() });
  useMetadataStore.getState()._reset();
});

test("shows received now-playing metadata while the optional recording lookup is still pending", async () => {
  let finishLookup!: (value: metadataClient.SearchRecordingsOutput) => void;
  let lookupStarted!: () => void;
  const started = new Promise<void>(resolve => { lookupStarted = resolve; });
  const lookup = new Promise<metadataClient.SearchRecordingsOutput>(resolve => { finishLookup = resolve; });
  const mock = spyOn(metadataClient, "getMetadataClient").mockReturnValue({
    ExtractStreamMetadata: async () => ({ result: { artist: "Love of Diagrams", song: "Pace or the Patience" } }),
    SearchRecordings: () => { lookupStarted(); return lookup; },
  } as unknown as metadataClient.WavefuncMetadataServerClient);
  disposals.push(() => mock.mockRestore());
  disposals.push(installMetadataSubscription());
  usePlayerStore.setState({ state: playingState(station, station.streams[0]!) });
  await started;
  try {
    expect(useMetadataStore.getState().currentMetadata?.song).toBe("Pace or the Patience");
    expect(useMetadataStore.getState().status).toBe("idle");
  } finally {
    finishLookup({ result: [] });
    await lookup;
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

function installClient(client: Partial<metadataClient.WavefuncMetadataServerClient>) {
  const mock = spyOn(metadataClient, "getMetadataClient").mockReturnValue(client as metadataClient.WavefuncMetadataServerClient);
  disposals.push(() => mock.mockRestore());
  disposals.push(installMetadataSubscription());
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test("a late reply from the previous station cannot replace the current song", async () => {
  const oldReply = deferred<metadataClient.ExtractStreamMetadataOutput>();
  installClient({
    ExtractStreamMetadata: url => url === station.streams[0]!.url
      ? oldReply.promise : Promise.resolve({ result: { song: "New station song" } }),
  });
  usePlayerStore.setState({ state: playingState(station, station.streams[0]!) });
  const next = { ...station, address: "31237:fixture:next", streams: [{ ...station.streams[0]!, url: "https://radio.example/next" }] };
  usePlayerStore.setState({ state: playingState(next, next.streams[0]!) });
  await settle();
  expect(useMetadataStore.getState().currentMetadata?.song).toBe("New station song");
  oldReply.resolve({ result: { song: "Old station song" } });
  await settle();
  expect(useMetadataStore.getState().currentMetadata?.song).toBe("New station song");
});

test("stopping clears metadata and ignores a pending enrichment result", async () => {
  const lookup = deferred<metadataClient.SearchRecordingsOutput>();
  installClient({
    ExtractStreamMetadata: async () => ({ result: { artist: "Artist", song: "Song" } }),
    SearchRecordings: () => lookup.promise,
  });
  usePlayerStore.setState({ state: playingState(station, station.streams[0]!) });
  await settle();
  expect(useMetadataStore.getState().currentMetadata?.song).toBe("Song");
  usePlayerStore.setState({ state: idleState() });
  expect(useMetadataStore.getState().currentMetadata).toBeNull();
  lookup.resolve({ result: [{ id: "recording", type: "recording", title: "Song", artist: "Artist", artistId: "artist", score: 100 }] });
  await settle();
  expect(useMetadataStore.getState().currentMetadata).toBeNull();
  expect(useMetadataStore.getState().status).toBe("idle");
});

test("failed extraction ends the loading state", async () => {
  installClient({ ExtractStreamMetadata: async () => { throw new Error("Request timed out"); } });
  usePlayerStore.setState({ state: playingState(station, station.streams[0]!) });
  await settle();
  expect(useMetadataStore.getState().status).toBe("error");
  expect(useMetadataStore.getState().lastFetchAt).not.toBeNull();
  expect(useMetadataStore.getState().lastError).toBe("Request timed out");
});
