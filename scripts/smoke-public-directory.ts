// Run with a freshly built dist: bun scripts/smoke-public-directory.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { matchFilters, type Filter } from "nostr-tools/filter";
import { generateSecretKey, finalizeEvent, type NostrEvent } from "nostr-tools/pure";
import { naddrEncode, npubEncode, neventEncode } from "nostr-tools/nip19";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const stationName = "Directory Test Radio";
const profileName = "Directory Test DJ";
const genrePath = "/genre/rock";
const site = "https://wavefunc.live";

// Sixty seconds of silent PCM gives Chromium real media to decode and play.
const sound = Buffer.alloc(44 + 8_000 * 60, 128);
sound.write("RIFF");
sound.writeUInt32LE(sound.length - 8, 4);
sound.write("WAVEfmt ", 8);
sound.writeUInt32LE(16, 16);
sound.writeUInt16LE(1, 20);
sound.writeUInt16LE(1, 22);
sound.writeUInt32LE(8000, 24);
sound.writeUInt32LE(8000, 28);
sound.writeUInt16LE(1, 32);
sound.writeUInt16LE(8, 34);
sound.write("data", 36);
sound.writeUInt32LE(sound.length - 44, 40);

const events: NostrEvent[] = [];
const fixture = Bun.serve({
  port: 0, hostname: "127.0.0.1",
  fetch(req, server) {
    if (new URL(req.url).pathname === "/station.wav") {
      return new Response(sound, { headers: { "Content-Type": "audio/wav", "Access-Control-Allow-Origin": "*" } });
    }
    if (!server.upgrade(req)) return new Response(null, { status: 400 });
  },
  websocket: {
    message(socket, data) {
      const [action, id, ...filters] = JSON.parse(String(data)) as [string, string, ...Filter[]];
      if (action !== "REQ") return;
      for (const event of events.filter(event => matchFilters(filters, event))) {
        socket.send(JSON.stringify(["EVENT", id, event]));
      }
      socket.send(JSON.stringify(["EOSE", id]));
    },
  },
});
const relay = "ws://127.0.0.1:" + fixture.port;
const mediaOrigin = "http://127.0.0.1:" + fixture.port;
const stream = mediaOrigin + "/station.wav";
const key = generateSecretKey();
const station = finalizeEvent({
  kind: 31237, created_at: 1720000000,
  tags: [["d", "directory-test"], ["name", stationName], ["c", "rock", "genre"], ["thumbnail", site + "/images/og-image.png"]],
  content: JSON.stringify({ description: "Local fixture station", streams: [{
    url: stream, format: "audio/wav", quality: { codec: "pcm", bitrate: 64, sampleRate: 8000 }, primary: true,
  }] }),
}, key);
const profile = finalizeEvent({
  kind: 0, created_at: station.created_at, tags: [], content: JSON.stringify({ name: profileName, about: "Local fixture DJ" }),
}, key);
events.push(station, profile);
const stationPath = "/station/" + naddrEncode({ kind: station.kind, identifier: "directory-test", pubkey: station.pubkey });
const aliasPath = "/station/" + neventEncode({ id: station.id, relays: ["wss://ignored.invalid"] });
const profilePath = "/profile/" + npubEncode(profile.pubkey);

const server = spawn(process.execPath, ["src/index.tsx"], {
  env: { ...process.env, NODE_ENV: "production", PORT: "0", PUBLIC_CATALOG_RELAY_URL: relay, PUBLIC_CATALOG_PROFILE_RELAYS: relay, PUBLIC_CATALOG_DB: ":memory:" },
  stdio: ["ignore", "pipe", "inherit"],
});
const exit = once(server, "exit");

async function serverOrigin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Production server did not start")), 10_000);
    server.stdout.on("data", data => {
      const port = String(data).match(/Server running at http:\/\/[^:]+:(\d+)/)?.[1];
      if (port) {
        clearTimeout(timer);
        resolve("http://127.0.0.1:" + port);
      }
    });
    server.once("exit", code => { clearTimeout(timer); reject(new Error("Production server exited " + code)); });
  });
}

async function isolate(context: BrowserContext, origin: string) {
  // All browser relay sockets are offline; navigation exercises the server snapshot.
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route(url => url.origin !== origin && url.origin !== mediaOrigin, route => route.abort());
}

async function open(page: Page, origin: string, path: string) {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, path);
}

async function assertMetadata(page: Page, canonical: string, name: string) {
  const tags = [
    ['link[rel="canonical"]', "href", site + canonical],
    ['meta[property="og:url"]', "content", site + canonical],
  ];
  for (const [selector, attribute, value] of tags) {
    const matches = page.locator(selector!);
    assert.equal(await matches.count(), 1, selector);
    assert.equal(await matches.getAttribute(attribute!), value, selector);
  }
  for (const tag of ["og:title", "twitter:title", "telegram:title"]) {
    const value = await page.locator(`meta[property="${tag}"],meta[name="${tag}"]`).getAttribute("content");
    assert.ok(value?.includes(name), tag);
  }
}

try {
  const origin = await serverOrigin();
  const browser = await chromium.launch();
  try {
    const disabled = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block", userAgent: "Twitterbot/1.0" });
    await isolate(disabled, origin);
    const crawler = await disabled.newPage();
    for (const [path, canonical, heading] of [
      ["/", "/", "WaveFunc Radio"], ["/apps", "/apps", "WaveFunc apps"],
      [genrePath, genrePath, "Rock radio stations"], [aliasPath, stationPath, stationName],
      [profilePath, profilePath, profileName],
    ] as const) {
      await open(crawler, origin, path);
      await crawler.getByRole("heading", { level: 1, name: heading, exact: true }).waitFor();
      await assertMetadata(crawler, canonical, path === "/apps" ? "Download WaveFunc" : heading);
    }
    await open(crawler, origin, genrePath);
    await crawler.getByRole("link", { name: stationName }).click();
    assert.equal(new URL(crawler.url()).pathname, stationPath);
    assert.equal(await crawler.getByRole("link", { name: "Listen live" }).getAttribute("href"), stream);
    const sitemap = await (await fetch(origin + "/sitemap.xml")).text();
    assert.ok(sitemap.includes(site + stationPath));
    assert.equal((await fetch(origin + "/station/" + "f".repeat(64))).status, 404);
    console.log("Verified crawler HTML, no-JS listening link, social previews, sitemap, and exact 404.");
    await disabled.close();

    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile, serviceWorkers: "block",
      });
      await isolate(context, origin);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.setDefaultTimeout(12_000);
      await open(page, origin, genrePath);
      await page.getByRole("link", { name: "Browse genres" }).waitFor(); // React mounted.
      await page.getByRole("link", { name: stationName }).click();
      await page.getByRole("heading", { level: 1, name: stationName, exact: true }).waitFor();
      await assertMetadata(page, stationPath, stationName);
      const play = page.locator('button[title="Play"]:visible:enabled').first();
      await play.click();
      await page.waitForFunction(() => {
        const audio = document.querySelector("audio");
        return audio && !audio.paused && audio.currentTime > 0;
      });
      const before = await page.evaluate(() => document.querySelector("audio")!.currentTime);
      await page.goBack();
      await page.getByRole("link", { name: "Browse genres" }).waitFor();
      await assertMetadata(page, genrePath, "Rock radio stations");
      await page.waitForFunction(time => {
        const audio = document.querySelector("audio");
        return audio && !audio.paused && audio.currentTime > time;
      }, before);
      if (mobile) {
        const pause = page.locator('button[title="Pause"]:visible');
        await pause.click();
        const resume = page.locator('button[title="Play"]:visible:enabled');
        const bounds = await resume.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= 390, "mobile Play must fit");
        await resume.click();
        await page.waitForFunction(() => document.querySelector("audio")?.paused === false);
      }
      await page.getByRole("link", { name: "Browse genres" }).click();
      await page.getByRole("heading", { name: "OSCILLATION_TYPES", exact: true }).waitFor();
      await page.locator('meta[name="robots"][content="noindex"]').waitFor({ state: "attached" });
      assert.equal(await page.locator('link[rel="canonical"],meta[property="og:url"]').count(), 0);
      await open(page, origin, profilePath);
      await page.locator("audio").waitFor({ state: "attached" }); // Same heading on both renderers.
      await page.getByRole("heading", { level: 1, name: profileName, exact: true }).waitFor();
      await assertMetadata(page, profilePath, profileName);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Verified ${mobile ? "mobile" : "desktop"} directory, station, Back during playback, and profile.`);
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  await exit;
  await fixture.stop(true);
}
