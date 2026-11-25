import type { PublicCatalog } from "./publicCatalog";
import type { PublicPage } from "../publicPageMetadata";
import { renderPublicPage } from "./publicPage";

import { normalizeGenreQuery, parseGenrePage } from "../genres";
import { serveSitemap } from "./sitemaps";

type RouteCatalog = Pick<PublicCatalog, "station" | "profile" | "genre" | "genres" | "sitemapBuckets" | "sitemapPaths">;
const apiPrefix = "/api/directory";

async function lookup(path: string, search: URLSearchParams, catalog: RouteCatalog): Promise<PublicPage | undefined> {
  if (path === "/") return { kind: "home" };
  if (path === "/apps") return { kind: "apps" };
  if (path === "/browse/genres") {
    const page = parseGenrePage(search.get("page"));
    if (!page || search.getAll("page").length > 1 || search.getAll("q").length > 1) return { kind: "not-found", path };
    const result = await catalog.genres(page, normalizeGenreQuery(search.get("q") ?? ""));
    if (result.status === "found") return { kind: "genres", ...result.value };
    return { kind: result.status === "missing" ? "not-found" : "unavailable", path };
  }
  const genre = /^\/genre\/([^/]+)$/.exec(path);
  if (genre) {
    const page = parseGenrePage(search.get("page"));
    if (!page || search.getAll("page").length > 1) return { kind: "not-found", path };
    let slug: string;
    try { slug = decodeURIComponent(genre[1]!); } catch { return { kind: "not-found", path }; }
    const result = await catalog.genre(slug, page);
    if (result.status === "found") return { kind: "genre", ...result.value };
    return { kind: result.status === "missing" ? "not-found" : "unavailable", path };
  }
  const match = /^\/(station|profile)\/([^/]+)$/.exec(path);
  if (!match) return;
  const param = match[2]!;
  const isStation = match[1] === "station";
  const result = isStation ? await catalog.station(param) : await catalog.profile(param);
  if (result.status === "found") return isStation
    ? { kind: "station", event: result.value }
    : { kind: "profile", pubkey: result.value.pubkey, event: result.value };
  return { kind: result.status === "missing" ? "not-found" : "unavailable", path };
}

export async function servePublicRoute(req: Request, catalog: RouteCatalog, getShell: () => Promise<string>) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const path = pathname.replace(/\/+$/, "") || "/";
  const json = path.startsWith(apiPrefix + "/");
  if (path === "/index.html") return new Response(null, { status: 308, headers: { Location: "/" + url.search } });
  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  const sitemap = await serveSitemap(req, catalog);
  if (sitemap) return sitemap;
  const page = await lookup(json ? path.slice(apiPrefix.length) : path, url.searchParams, catalog);
  if (!page) return undefined;
  const status = page.kind === "not-found" ? 404 : page.kind === "unavailable" ? 503 : 200;
  if (status === 503) headers.set("Retry-After", "60");
  if (json) headers.set("X-Robots-Tag", "noindex");
  headers.set("Content-Type", json ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  const body = req.method === "HEAD" ? null : json ? JSON.stringify(page) : renderPublicPage(await getShell(), page);
  return new Response(body, { status, headers });
}
