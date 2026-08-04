import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openUrl, toLightningUri } from "../src/lib/openUrl";
import { platformInfo } from "../src/lib/platform";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("platform-aware external navigation", () => {
  test("keeps web and installed Android runtime states distinct", () => {
    expect(platformInfo("web", false)).toMatchObject({
      platform: "web",
      isTauri: false,
      isWeb: true,
      isMobile: false,
      isAndroid: false,
    });
    expect(platformInfo("android", true)).toMatchObject({
      platform: "android",
      isTauri: true,
      isWeb: false,
      isMobile: true,
      isAndroid: true,
    });
  });

  test("normalizes invoices into wallet-dispatchable Lightning URIs", () => {
    expect(toLightningUri("lnbc123")).toBe("lightning:lnbc123");
    expect(toLightningUri("LIGHTNING:lnbc123")).toBe("LIGHTNING:lnbc123");
  });

  test("dispatches custom schemes through Tauri instead of WebView navigation", async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalIsTauri = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
    const calls: Array<{ command: string; args: unknown }> = [];

    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          hostname: "tauri.localhost",
          protocol: "https:",
          assign: () => {
            throw new Error("native navigation must not use window.location");
          },
        },
        __TAURI_INTERNALS__: {
          invoke: async (command: string, args: unknown) => {
            calls.push({ command, args });
          },
        },
      },
    });

    try {
      await openUrl("lightning:lnbc123");
      expect(calls).toEqual([
        {
          command: "plugin:opener|open_url",
          args: { url: "lightning:lnbc123", with: undefined },
        },
      ]);
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
      if (originalIsTauri) {
        Object.defineProperty(globalThis, "isTauri", originalIsTauri);
      } else {
        delete (globalThis as { isTauri?: unknown }).isTauri;
      }
    }
  });

  test("grants only the external URI schemes WaveFunc uses", () => {
    const capability = JSON.parse(
      read("src-tauri/capabilities/default.json"),
    ) as { permissions: Array<string | { identifier: string; allow: Array<{ url: string }> }> };
    const opener = capability.permissions.find(
      (permission) =>
        typeof permission !== "string" &&
        permission.identifier === "opener:allow-open-url",
    );

    expect(opener).toEqual({
      identifier: "opener:allow-open-url",
      allow: [
        { url: "http://*" },
        { url: "https://*" },
        { url: "mailto:*" },
        { url: "tel:*" },
        { url: "lightning:*" },
        { url: "nostrconnect:*" },
        { url: "bunker:*" },
      ],
    });

    expect(read("src-tauri/src/lib.rs")).toContain("tauri_plugin_opener::init()");
    expect(read("src/lib/openUrl.ts")).not.toContain("plugin-shell");
  });
});
