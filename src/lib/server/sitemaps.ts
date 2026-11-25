import { createHash } from "node:crypto";
import type { CatalogResult } from "./publicCatalog";

const site = "https://wavefunc.live";
const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const maxEntries = 50_000;
const maxBytes = 50 * 1024 * 1024;
// Even 3,500 maximum-length URLs composed of XML-escaped characters fit in 50 MiB.
export const SITEMAP_PAGE_SIZE = 3_500;
export type SitemapKind = "stations" | "genres";
export type SitemapBucketCount = { kind: SitemapKind; bucket: number; count: number };

export interface SitemapCatalog {
  sitemapBuckets(): Promise<CatalogResult<SitemapBucketCount[]>>;
  sitemapPaths(kind: SitemapKind, bucket: number, offset: number, limit: number): Promise<CatalogResult<string[]>>;
}

/** Derive a persistent bucket from the stable coordinate or genre slug, independent of event revisions. */
export function sitemapBucket(key: string): number {
  return createHash("sha256").update(key).digest()[0]! >>> 4;
}

function unavailable() {
  return new Response(null, { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
}

function xmlResponse(req: Request, paths: string[], index = false) {
  const root = index ? "sitemapindex" : "urlset";
  const entry = index ? "sitemap" : "url";
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${root} xmlns="${namespace}">`];
  for (const path of paths) {
    const href = new URL(path, site);
    if (href.origin !== site || href.hash || href.href.length >= 2048) return unavailable();
    lines.push(`<${entry}><loc>${Bun.escapeHTML(href.href)}</loc></${entry}>`);
  }
  lines.push(`</${root}>`);
  const body = lines.join("\n");
  if (paths.length > maxEntries || Buffer.byteLength(body) > maxBytes) return unavailable();
  return new Response(req.method === "HEAD" ? null : body, { headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  } });
}

/** The submitted root stays stable. Child files are at the site root so they can describe its public routes. */
export async function serveSitemap(req: Request, catalog: SitemapCatalog): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  if (path === "/sitemap.xml") {
    const buckets = await catalog.sitemapBuckets();
    if (buckets.status !== "found") return unavailable();
    const paths = ["/sitemap-pages.xml"];
    for (const { kind, bucket, count } of buckets.value) {
      const pages = Math.ceil(count / SITEMAP_PAGE_SIZE);
      if (paths.length + pages > maxEntries) return unavailable();
      for (let page = 1; page <= pages; page++) {
        paths.push(`/sitemap-${kind}-${bucket.toString(16)}-${page}.xml`);
      }
    }
    return xmlResponse(req, paths, true);
  }
  if (path === "/sitemap-pages.xml") return xmlResponse(req, ["/", "/apps", "/browse/genres"]);

  const match = /^\/sitemap-(stations|genres)-([0-9a-f])-([1-9]\d{0,4})\.xml$/.exec(path);
  if (!match) return undefined;
  const kind = match[1] as SitemapKind;
  const bucket = parseInt(match[2]!, 16);
  const offset = (Number(match[3]) - 1) * SITEMAP_PAGE_SIZE;
  const result = await catalog.sitemapPaths(kind, bucket, offset, SITEMAP_PAGE_SIZE);
  if (result.status === "unavailable") return unavailable();
  if (result.status === "missing" || !result.value.length) return new Response(null, { status: 404 });
  return xmlResponse(req, result.value);
}
