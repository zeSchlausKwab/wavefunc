// Run with a freshly built dist: bun scripts/smoke-public-directory.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchFilters, type Filter } from "nostr-tools/filter";
import { generateSecretKey, finalizeEvent, type NostrEvent } from "nostr-tools/pure";
import { naddrEncode, npubEncode, neventEncode } from "nostr-tools/nip19";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { importStations } from "../src/lib/server/directoryIndex";
import { publicCollectionPath, publicStationPath } from "../src/lib/publicPageMetadata";
import { genrePath as pathForGenre, genreSlug } from "../src/lib/genres";

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
const jazz = Array.from({ length: 56 }, (_, index) => finalizeEvent({
  kind: 31237, created_at: station.created_at + index,
  tags: [["d", "jazz-" + index], ["name", "Jazz fixture " + index], ["c", "Jazz", "genre"]],
  content: station.content.replace(stream, stream + "?station=" + index),
}, key));
const untagged = finalizeEvent({
  kind: 31237, created_at: station.created_at, tags: [["d", "untagged"], ["name", "Untagged Radio"]],
  content: station.content.replace(stream, stream + "?station=untagged"),
}, key);
const worldGenres = Array.from({ length: 101 }, (_, index) => "World mix " + String(index).padStart(3, "0"));
const international = "日本/Alternative & Rock";
const internationalPath = pathForGenre(genreSlug(international));
const worldStation = finalizeEvent({
  kind: 31237, created_at: station.created_at, content: station.content,
  tags: [["d", "world"], ["name", "World Radio"], ...[...worldGenres, international].map(name => ["c", name, "genre"])],
}, key);
const stations = [station, ...jazz, untagged, worldStation];
const allGenrePaths = ["/genre/rock", "/genre/jazz", internationalPath, ...worldGenres.map(name => pathForGenre(genreSlug(name)))];
events.push(...stations, profile);
const stationPath = "/station/" + naddrEncode({ kind: station.kind, identifier: "directory-test", pubkey: station.pubkey });
const aliasPath = "/station/" + neventEncode({ id: station.id, relays: ["wss://ignored.invalid"] });
const profilePath = "/profile/" + npubEncode(profile.pubkey);
const collectionName = "After hours selections";
const collection = finalizeEvent({
  kind: 30078, created_at: station.created_at, content: JSON.stringify({ name: collectionName }),
  tags: [["d", "after:hours"], ["l", "wavefunc_user_favourite_list"], ["a", `31237:${station.pubkey}:directory-test`], ["a", `31237:${station.pubkey}:untagged`]],
}, key);
events.push(collection);
const collectionPath = publicCollectionPath(collection);

const directory = mkdtempSync(join(tmpdir(), "wavefunc-directory-smoke-"));
const databasePath = join(directory, "directory.sqlite");
await importStations(databasePath, stations);
// Match the synchronous module loading used by the production PM2 interpreter.
const server = spawn(process.execPath, ["-e", 'require("./src/index.tsx")'], {
  env: { ...process.env, NODE_ENV: "production", PORT: "0", PUBLIC_DIRECTORY_DB: databasePath, PUBLIC_CATALOG_RELAY_URL: relay, PUBLIC_CATALOG_PROFILE_RELAYS: relay, PUBLIC_CATALOG_DB: ":memory:", PUBLIC_SITEMAP_MIN_GENRE_STATIONS: "1" },
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
  await page.locator('link[rel="canonical"][href="' + site + canonical + '"]').waitFor({ state: "attached" });
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
    assert.ok(value?.includes(name), `${canonical} ${tag}: expected "${name}" in "${value}"`);
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
      [collectionPath, collectionPath, collectionName],
      ["/browse/genres", "/browse/genres", "Radio genres"],
      ["/genre/jazz", "/genre/jazz", "Jazz radio stations"],
    ] as const) {
      await open(crawler, origin, path);
      await crawler.getByRole("heading", { level: 1, name: heading, exact: true }).waitFor();
      const title = path === "/apps" ? "Download WaveFunc" : path === "/browse/genres" ? "Browse radio stations by genre" : heading;
      await assertMetadata(crawler, canonical, title);
    }
    await open(crawler, origin, "/browse/genres");
    const genreLinks = crawler.locator('main li a[href^="/genre/"]');
    const firstGenres = await genreLinks.evaluateAll(links => links.map(link => link.getAttribute("href")));
    await crawler.getByRole("link", { name: "Next page", exact: true }).click();
    await assertMetadata(crawler, "/browse/genres?page=2", "Browse radio stations by genre");
    const lastGenres = await genreLinks.evaluateAll(links => links.map(link => link.getAttribute("href")));
    assert.deepEqual([...firstGenres, ...lastGenres].sort(), [...allGenrePaths].sort());
    const search = crawler.getByRole("searchbox", { name: "Search genres" });
    await search.fill("日本");
    await search.press("Enter");
    await crawler.locator('meta[name="robots"][content*="noindex"]').waitFor({ state: "attached" });
    await crawler.locator('a[href="' + internationalPath + '"]').click();
    await assertMetadata(crawler, internationalPath, international);
    await open(crawler, origin, "/browse/genres");
    await crawler.locator('a[href="/genre/jazz"]').first().click();
    const latestJazz = await crawler.locator('main a[href^="/station/"]').evaluateAll(links => links.map(link => link.getAttribute("href")));
    assert.deepEqual(latestJazz, jazz.slice(-50).reverse().map(publicStationPath));
    assert.equal(await crawler.getByRole("link", { name: "Next page", exact: true }).count(), 0);
    const legacy = await fetch(origin + "/genre/jazz?page=2", { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/genre/jazz");
    await open(crawler, origin, genrePath);
    await crawler.getByRole("link", { name: stationName }).click();
    assert.equal(new URL(crawler.url()).pathname, stationPath);
    assert.equal(await crawler.getByRole("link", { name: "Listen live" }).getAttribute("href"), stream);
    async function sitemapUrls(path: string) {
      const res = await fetch(origin + path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get("content-type") ?? "", /application\/xml/);
      return Array.from((await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g), match => {
        const url = new URL(match[1]!);
        assert.equal(url.origin, site);
        return url.pathname;
      });
    }
    const children = await sitemapUrls("/sitemap.xml");
    const urls = (await Promise.all(children.map(sitemapUrls))).flat();
    assert.deepEqual(urls.sort(), ["/", "/apps", "/browse/genres", ...allGenrePaths, ...stations.map(publicStationPath)].sort());
    assert.equal((await fetch(origin + "/station/" + "f".repeat(64))).status, 404);
    for (const path of ["/genre/unknown", "/genre/jazz?page=99999"]) {
      assert.equal((await fetch(origin + path)).status, 404, path);
    }
    console.log("Verified all stations and genres in the sitemap, no-JS pagination, previews, and exact 404s.");
    await disabled.close();

    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: mobile, hasTouch: mobile, reducedMotion: "no-preference", serviceWorkers: "block",
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
      const cube = page.locator(".wf-cube-body:visible").first();
      const rotation = await cube.evaluateHandle(el => el.getAnimations()[0]!);
      assert.equal(await rotation.evaluate(animation => animation.playbackRate), 1);
      assert.equal(await rotation.evaluate(animation => animation.effect?.getTiming().iterations === Infinity), true);
      const period = await rotation.evaluate(animation => Number(animation.effect?.getTiming().duration));
      assert.ok(Math.abs(2 * Math.PI / (period / 1000) - 0.52) < 0.01, "idle cube speed");
      const play = page.locator('button[title="Play"]:visible:enabled').first();
      await play.click();
      await page.waitForFunction(() => {
        const audio = document.querySelector("audio");
        return audio && !audio.paused && audio.currentTime > 0;
      });
      await page.waitForFunction(animation => animation.playState === "running" && animation.playbackRate > 1, rotation);
      const rate = await rotation.evaluate(animation => animation.playbackRate);
      assert.ok(Math.abs(2 * Math.PI * rate / (period / 1000) - 2.25) < 0.01, "playing cube speed");
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
        await page.waitForFunction(animation => animation.playbackRate === 1, rotation);
        const resume = page.locator('button[title="Play"]:visible:enabled');
        const bounds = await resume.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= 390, "mobile Play must fit");
        await resume.click();
        await page.waitForFunction(() => document.querySelector("audio")?.paused === false);
      }
      await page.getByRole("link", { name: "Browse genres" }).click();
      await page.getByRole("heading", { name: "Radio genres", exact: true }).waitFor();
      await assertMetadata(page, "/browse/genres", "Browse radio stations by genre");
      await page.locator('a[href="/genre/jazz"]').first().click();
      await assertMetadata(page, "/genre/jazz", "Jazz radio stations");
      const dial = page.getByRole("button", { name: "Play Jazz", exact: true });
      await dial.click();
      const expectPlayback = async (url: string) => {
        await page.waitForFunction(expected => {
          const audio = document.querySelector("audio");
          return audio && !audio.paused && audio.currentTime > 0 && audio.currentSrc === expected;
        }, url);
      };
      await expectPlayback(stream + "?station=" + (jazz.length - 1));
      await page.getByRole("button", { name: "Next station", exact: true }).click();
      await expectPlayback(stream + "?station=" + (jazz.length - 2));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => Array.from(document.querySelectorAll(".wf-cube-body")).every(el => el.getAnimations().length === 0));
      await rotation.dispose();
      await open(page, origin, collectionPath);
      await assertMetadata(page, collectionPath, collectionName);
      const playCollection = page.getByRole("button", { name: "Play collection", exact: true });
      await playCollection.waitFor(); // Signed-out interactive view, after the HTML preview.
      const list = page.getByRole("list").filter({ has: page.getByRole("link", { name: stationName, exact: true }) });
      assert.deepEqual(await list.getByRole("link").allTextContents(), [stationName, "Untagged Radio"]);
      await playCollection.click();
      await expectPlayback(stream);
      await page.getByRole("button", { name: "Next station", exact: true }).click();
      await expectPlayback(stream + "?station=untagged");
      await open(page, origin, profilePath);
      await page.locator("audio").waitFor({ state: "attached" }); // Same heading on both renderers.
      await page.getByRole("heading", { level: 1, name: profileName, exact: true }).waitFor();
      await assertMetadata(page, profilePath, profileName);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Verified ${mobile ? "mobile" : "desktop"} genre navigation, cube motion, Back during playback, and profile.`);
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  await exit;
  await fixture.stop(true);
  rmSync(directory, { recursive: true, force: true });
}
