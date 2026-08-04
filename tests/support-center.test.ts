import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("support center overlay", () => {
  test("is owned by the app root instead of a navigation sheet", () => {
    const rootRoute = read("src/routes/__root.tsx");
    const navigation = read("src/components/NavigationItems.tsx");
    const support = read("src/components/SupportPopover.tsx");

    expect(rootRoute).toContain("<SupportDialog />");
    expect(navigation).toContain(
      '<SupportTrigger variant="menu" onOpen={onNavigate} />',
    );
    expect(support).toContain('open={open}');
    expect(support).toContain('h-[100dvh]');
    expect(support).not.toContain("PopoverContent");
  });

  test("opens support while atomically dismissing the player sheet", () => {
    const store = read("src/stores/uiStore.ts");

    expect(store).toContain("supportOpen: boolean");
    expect(store).toContain("supportOpen: true");
    expect(store).toContain("sheetOpen: false");
    expect(store).toContain("closeSupport: () => set({ supportOpen: false })");
  });
});
