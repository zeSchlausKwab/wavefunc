import { describe, expect, test } from "bun:test";
import { serveSitemap, sitemapBucket, SITEMAP_PAGE_SIZE, type SitemapCatalog } from "../src/lib/server/sitemaps";

const counts = { kind: "stations" as const, bucket: 13, count: SITEMAP_PAGE_SIZE + 2 };

function request(path: string, catalog: SitemapCatalog, method = "GET") {
  return serveSitemap(new Request("https://alternate-host.invalid" + path, { method }), catalog);
}

const offline: SitemapCatalog = {
  sitemapBuckets: async () => ({ status: "unavailable" }),
  sitemapPaths: async () => ({ status: "unavailable" }),
};

describe("public sitemaps", () => {
  test("the existing index names only populated shards and never loads individual pages", async () => {
    const catalog: SitemapCatalog = {
      sitemapBuckets: async () => ({ status: "found", value: [counts, { kind: "genres", bucket: 0, count: 1 }] }),
      sitemapPaths: async () => { throw new Error("Index must only read bucket counts"); },
    };
    const res = await request("/sitemap.xml", catalog);
    const body = await res!.text();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("Content-Type")).toStartWith("application/xml");
    expect(body).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])).toEqual([
      "https://wavefunc.live/sitemap-pages.xml",
      "https://wavefunc.live/sitemap-stations-d-1.xml",
      "https://wavefunc.live/sitemap-stations-d-2.xml",
      "https://wavefunc.live/sitemap-genres-0-1.xml",
    ]);
  });

  test("child pages read exactly one ordered slice of station or genre paths", async () => {
    const catalog: SitemapCatalog = {
      ...offline,
      sitemapPaths: async (kind, bucket, offset, limit) => {
        expect([kind, bucket, offset, limit]).toEqual(["stations", 13, SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE]);
        return { status: "found", value: ["/station/naddr1a", "/station/naddr1b"] };
      },
    };
    const path = "/sitemap-stations-d-2.xml";
    const response = await request(path, catalog);
    expect(await response!.text()).toContain("<url><loc>https://wavefunc.live/station/naddr1b</loc></url>");
    const head = await request(path, catalog, "HEAD");
    expect(head!.status).toBe(200);
    expect(head!.body).toBeNull();
    // Shards already named in a submitted index must stay at the same URLs across releases.
    expect(sitemapBucket("rock")).toBe(3);
    expect(sitemapBucket("jazz")).toBe(12);
  });

  test("long international genre URLs stay within the byte limit with XML escaping", async () => {
    const longSlug = encodeURIComponent("音".repeat(202)) + "&'roll";
    const paths = Array.from({ length: SITEMAP_PAGE_SIZE }, (_, i) => "/genre/" + longSlug + i);
    const res = await request("/sitemap-genres-a-1.xml", {
      ...offline, sitemapPaths: async () => ({ status: "found", value: paths }),
    });
    expect(res!.status).toBe(200);
    const xml = await res!.text();
    expect(xml.match(/<url>/g)).toHaveLength(SITEMAP_PAGE_SIZE);
    expect(Buffer.byteLength(xml)).toBeLessThan(50 * 1024 * 1024);
    expect(xml).toContain("%E9%9F%B3");
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("alternate-host");
  });

  test("complete empty snapshots and outages produce different public responses", async () => {
    const empty: SitemapCatalog = {
      sitemapBuckets: async () => ({ status: "found", value: [] }),
      sitemapPaths: async () => ({ status: "missing" }),
    };
    expect(await (await request("/sitemap.xml", empty))!.text()).toContain("/sitemap-pages.xml</loc>");
    expect((await request("/sitemap-stations-0-1.xml", empty))!.status).toBe(404);
    for (const path of ["/sitemap.xml", "/sitemap-stations-0-1.xml"]) {
      const res = await request(path, offline);
      expect(res!.status).toBe(503);
      expect(res!.headers.get("Retry-After")).toBe("60");
    }
    const pages = await (await request("/sitemap-pages.xml", offline))!.text();
    expect([...pages.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])).toEqual([
      "https://wavefunc.live/", "https://wavefunc.live/apps", "https://wavefunc.live/browse/genres",
    ]);
    expect(await request("/genre/rock", empty)).toBeUndefined();
    expect(await request("/sitemap-stations-f-0.xml", empty)).toBeUndefined();
  });
});
