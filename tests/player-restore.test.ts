import { expect, test } from "bun:test";
import { EventStore } from "applesauce-core";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { parseStationEvent } from "../src/lib/nostr/domain/station";
import { idleState, playingState } from "../src/lib/player/state";
import { usePlayerStore } from "../src/stores/playerStore";

test("a late startup lookup cannot replace a listener's new station", async () => {
  const key = generateSecretKey();
  const station = (identifier: string) => parseStationEvent(finalizeEvent({
    kind: 31237, tags: [["d", identifier]], created_at: 1,
    content: JSON.stringify({ streams: [{ url: "https://streams.example/" + identifier, format: "audio/mpeg" }] }),
  }, key));
  const saved = station("saved");
  const chosen = station("chosen");
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => saved.naddr } });
  const previous = usePlayerStore.getState();
  try {
    usePlayerStore.setState({ state: idleState() });
    const events = new EventStore();
    const restoring = usePlayerStore.getState().restoreLastStation(events);
    const playing = playingState(chosen, chosen.streams[0]!);
    usePlayerStore.setState({ state: playing });
    events.add(saved.event);
    await restoring;
    const state = usePlayerStore.getState().state;
    expect(state.kind).toBe("playing");
    expect(state.kind === "playing" && state.station.id).toBe(chosen.id);

    usePlayerStore.setState({ state: idleState() });
    await usePlayerStore.getState().restoreLastStation(events);
    expect(usePlayerStore.getState().state.kind).toBe("paused");
    expect(usePlayerStore.getState().currentStation?.id).toBe(saved.id);
  } finally {
    usePlayerStore.setState(previous, true);
    if (storage) Object.defineProperty(globalThis, "localStorage", storage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
