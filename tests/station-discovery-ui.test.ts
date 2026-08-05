import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("station discovery UI contracts", () => {
  test("places every signed observer chart on the unfiltered landing page", () => {
    const route = read("src/routes/index.tsx");
    const charts = read("src/components/SignalCharts.tsx");

    expect(route).toContain("showFeatured && <SignalCharts />");
    expect(charts).toContain('metric: "best-signal"');
    expect(charts).toContain('metric: "has-now-playing"');
    expect(charts).toContain('metric: "most-listened"');
    expect(charts).toContain('metric: "most-liked"');
    expect(charts).toContain('metric: "most-zapped"');
    expect(charts).toContain('metric: "on-air-now"');
    expect(charts).toContain("if (panelCount === 0) return null");
  });

  test("surfaces quality scores on cards and in the persistent player", () => {
    const badge = read("src/components/StationHealthBadge.tsx");
    const player = read("src/components/FloatingPlayer.tsx");

    expect(badge).toContain("`QUALITY_${health.score}`");
    expect(badge).toContain("`Q_${health.score}`");
    expect(player).toContain("useStationHealth(healthAddresses)");
    expect(player).toContain("showPending");
  });

  test("adds recent user-downloaded Blossom songs to signal charts", () => {
    const charts = read("src/components/SignalCharts.tsx");

    expect(charts).toContain("RECENT_DOWNLOADS");
    expect(charts).toContain("BLOSSOM_ARCHIVE");
    expect(charts).toContain("song.audioUrl && song.youtubeId");
    expect(charts).toContain("useAppDataTimeline(songFilters)");
  });

  test("keeps favorite station contents in a touch-friendly nested viewport", () => {
    const favorites = read("src/components/FavoriteListCard.tsx");
    const featured = read("src/components/FeaturedLists.tsx");

    for (const source of [favorites, featured]) {
      expect(source).toContain("overflow-y-scroll");
      expect(source).toContain("overscroll-contain");
      expect(source).toContain("scrollbar-gutter:stable");
      expect(source).toContain("-webkit-overflow-scrolling:touch");
      expect(source).not.toContain("overflow-y-auto scrollbar-none");
    }
  });

  test("loads station health in batches above card rendering", () => {
    const stationView = read("src/components/StationView.tsx");
    const card = read("src/components/RadioCard.tsx");

    expect(stationView).toContain("useStationHealth(stationAddresses)");
    expect(card).toContain("health?: StationHealthSummary");
    expect(card).not.toContain("useStationHealth(");
  });
});
