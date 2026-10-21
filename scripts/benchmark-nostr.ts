// Synthetic EventStore/model benchmark. Signature verification is deliberately
// excluded: this measures routing and model updates, not end-to-end UI latency.
import { EventStore } from "applesauce-core";
import { TimelineModel } from "applesauce-core/models";
import type { NostrEvent } from "applesauce-core/helpers/event";

const targets = Array.from({ length: 100 }, (_, i) => (i + 1).toString(16).padStart(64, "0"));
const events: NostrEvent[] = Array.from({ length: 10_000 }, (_, i) => ({
  id: (i + 1000).toString(16).padStart(64, "0"),
  pubkey: (i % 500 + 1).toString(16).padStart(64, "0"),
  kind: i % 2 ? 7 : 1,
  tags: [["e", targets[i % targets.length]!]],
  content: i % 2 ? "+" : "Unrelated note",
  created_at: 1_700_000_000 + i,
  sig: "0".repeat(128),
}));

async function run() {
  const store = new EventStore({ verifyEvent: () => true });
  let emissions = 0;
  const subscriptions = targets.map((id) =>
    store.model(TimelineModel, { kinds: [7], "#e": [id] }).subscribe(() => emissions++),
  );
  const start = performance.now();
  // New objects per run avoid carrying SDK helper caches across iterations.
  for (const event of events) store.add({ ...event });
  const ingestMs = performance.now() - start;
  await new Promise((resolve) => setTimeout(resolve, 25));
  const readStart = performance.now();
  let matches = 0;
  for (const id of targets) matches += store.getByFilters([{ kinds: [7], "#e": [id] }]).length;
  const warmReadMs = performance.now() - readStart;
  for (const subscription of subscriptions) subscription.unsubscribe();
  store.dispose();
  return { ingestMs, warmReadMs, emissions, matches };
}

await run(); // Warm the JS runtime.
const runs: Awaited<ReturnType<typeof run>>[] = [];
for (let i = 0; i < 5; i++) runs.push(await run());
const median = (key: "ingestMs" | "warmReadMs") =>
  Number(runs.map((run) => run[key]).sort((a, b) => a - b)[2]!.toFixed(2));
const manifest = await Bun.file(new URL("../node_modules/applesauce-core/package.json", import.meta.url)).json();
console.log(JSON.stringify({
  applesauceCore: manifest.version, bun: Bun.version,
  workload: { events: events.length, observedTargets: targets.length, verification: "excluded" },
  medianIngestMs: median("ingestMs"), medianWarmReadMs: median("warmReadMs"), runs,
}, null, 2));
