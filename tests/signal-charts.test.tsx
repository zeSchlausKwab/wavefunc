import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildStationRankingTemplate, parseStationEvent, parseStationRankingEvent, type ParsedStation } from "../src/lib/nostr/domain";

// The rendered chart items import the browser account store. Give it isolated,
// empty storage so importing the real view never reads a user's account state.
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
  } satisfies Storage,
});
afterAll(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});
const { SignalChartsView } = await import("../src/components/SignalCharts");

function renderCharts(
  entries: Array<{ stationAddress: string; value: number }> = [],
  stationsLoading = false,
  stations: ParsedStation[] = [],
) {
  const now = Math.floor(Date.now() / 1_000);
  const snapshot = parseStationRankingEvent({
    ...buildStationRankingTemplate({ metric: "most-listened", window: "24h", generatedAt: now, entries }),
    id: "1".repeat(64), pubkey: "2".repeat(64), sig: "3".repeat(128), created_at: now,
  })!;
  return renderToStaticMarkup(
    <SignalChartsView
      rankings={new Map([["most-listened", snapshot]])}
      isLoading={false}
      recentDownloads={[]}
      songsLoading={false}
      byAddress={new Map(stations.map(station => [station.address!, station]))}
      stationsLoading={stationsLoading}
      health={new Map()}
    />,
  );
}

describe("listening chart visibility", () => {
  test("keeps the chart visible when the signed 24-hour snapshot is empty", () => {
    const html = renderCharts();
    expect(html).toContain("MOST_LISTENED");
    expect(html).toContain("No listening activity recorded in the last 24 hours.");
  });

  test("does not describe unresolved ranked stations as an empty listening window", () => {
    const html = renderCharts([{ stationAddress: `31237:${"a".repeat(64)}:test`, value: 2 }], true);
    expect(html).toContain("Loading station rankings");
    expect(html).not.toContain("No listening activity recorded");
  });

  test("shows the ranked station and listener minutes once activity is available", () => {
    const station = parseStationEvent({
      id: "4".repeat(64), pubkey: "a".repeat(64), sig: "5".repeat(128),
      kind: 31237, created_at: 1_700_000_000,
      tags: [["d", "test"], ["name", "Test Radio"]],
      content: JSON.stringify({ description: "A test station", streams: [] }),
    });
    const html = renderCharts([{ stationAddress: station.address!, value: 2 }], false, [station]);
    expect(html).toContain("MOST_LISTENED");
    expect(html).toContain("Test_Radio");
    expect(html).toContain("2 LISTENER_MIN");
    expect(html).not.toContain("No listening activity recorded");
  });
});
