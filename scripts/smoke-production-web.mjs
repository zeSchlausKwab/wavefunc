import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3000").origin;
const browser = await chromium.launch();
try {
  const routes = [
    ["/", "LIVE_STATIONS"],
    ["/apps", "DOWNLOAD"],
    ["/browse/genres", "OSCILLATION_TYPES"],
  ];
  for (const [path, heading] of routes) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      // A cold deep link must mount even when every relay and external service is offline.
      await context.route(url => url.origin !== origin, route => route.abort());
      await context.routeWebSocket("**/*", socket => socket.close());
      const page = await context.newPage();
      const errors = [];
      const assets = new Set();
      page.on("pageerror", error => errors.push(error.message));
      page.on("crash", () => errors.push("Browser tab crashed"));
      page.on("response", response => {
        if (new URL(response.url()).origin !== origin) return;
        const type = response.request().resourceType();
        if (type !== "script" && type !== "stylesheet") return;
        const mime = response.headers()["content-type"] ?? "";
        if (response.ok() && (type === "script" ? /javascript/.test(mime) : /text\/css/.test(mime))) {
          assets.add(type);
        } else {
          errors.push(`${response.status()} ${mime} for ${response.url()}`);
        }
      });

      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 200, path);
      try {
        await page.getByRole("heading", { name: heading, exact: true }).waitFor({ timeout: 10_000 });
      } catch (cause) {
        throw new Error(`${path} did not render ${heading}. ${errors.join("\n")}`, { cause });
      }
      assert.deepEqual(errors, [], path);
      assert.deepEqual(assets, new Set(["script", "stylesheet"]), `Missing production assets on ${path}`);
      console.log(`${path} rendered ${heading}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
