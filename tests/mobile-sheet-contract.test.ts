import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const player = readFileSync(
  join(import.meta.dir, "../src/components/FloatingPlayer.tsx"),
  "utf8",
);
const sidebar = readFileSync(
  join(import.meta.dir, "../src/components/MobileNavigationSidebar.tsx"),
  "utf8",
);
const store = readFileSync(
  join(import.meta.dir, "../src/stores/uiStore.ts"),
  "utf8",
);

describe("mobile player chrome", () => {
  test("keeps the player mounted below contextual station detail", () => {
    expect(player).toContain("Persistent mobile player");
    expect(player).toContain("bottom-0 z-[90] h-16");
    expect(player).toContain("bottom-16 z-[70]");
    expect(player).toContain("stationSheetOpen");
  });

  test("uses the station grabber to toggle size without closing it", () => {
    const handler = player.slice(
      player.indexOf("const handleGrabberClick"),
      player.indexOf("const handleGrabberKeyDown"),
    );

    expect(handler).toContain('setSheetSnap("expanded")');
    expect(handler).toContain('setSheetSnap("peek")');
    expect(handler).not.toContain("closeSheet()");
    expect(player).toContain('aria-label="Resize station details"');
  });

  test("opens an accessible left sidebar from the persistent WF control", () => {
    expect(player).toContain("onClick={openSidebar}");
    expect(player).toContain('aria-controls="mobile-navigation-sidebar"');
    expect(sidebar).toContain('side="left"');
    expect(sidebar).toContain('id="mobile-navigation-sidebar"');
    expect(sidebar).toContain("<LoginSessionButtons onNavigate={closeSidebar} />");
    expect(sidebar).toContain('<NavigationItems variant="mobile"');
    expect(sidebar).toContain('<SleepTimerButton variant="full" />');
  });

  test("keeps global navigation and contextual detail state independent", () => {
    expect(store).toContain("sidebarOpen: boolean");
    expect(store).toContain("stationSheetOpen: boolean");
    expect(store).not.toContain('sheetMode: "nav" | "station"');
  });
});
