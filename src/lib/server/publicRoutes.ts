import type { PublicCatalog } from "./publicCatalog";
import { publicStationPath, type PublicPage } from "../publicPageMetadata";
import { renderPublicPage } from "./publicPage";

const genrePath = "/genre/rock";
const origin = "https://wavefunc.live";
const apiPrefix = "/api/directory";

async function lookup(path: string, catalog: PublicCatalog): Promise<PublicPage | undefined> {
  if (path === "/") return { kind: "home" };
  if (path === "/apps") return { kind: "apps" };
  if (path === genrePath) {
    const result = await catalog.genre("rock");
    if (result.status === "found") return { kind: "genre", events: result.value };
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

export async function servePublicRoute(req: Request, catalog: PublicCatalog, getShell: () => Promise<string>) {
  const pathname = new URL(req.url).pathname;
  const path = pathname.replace(/\/+$/, "") || "/";
  const json = path.startsWith(apiPrefix + "/");
  if (path === "/index.html") return new Response(null, { status: 308, headers: { Location: "/" + new URL(req.url).search } });
  const headers = new Headers({
    "Cache-Control": "no-cache",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (path === "/sitemap.xml") {
    const urls = [origin + "/", origin + "/apps", origin + genrePath];
    const genre = await catalog.genre("rock");
    if (genre.status === "unavailable") {
      headers.set("Retry-After", "60");
      return new Response(null, { status: 503, headers });
    }
    if (genre.status === "found") urls.push(...genre.value.map(event => origin + publicStationPath(event)));
    headers.set("Content-Type", "application/xml; charset=utf-8");
    // Canonical station paths use only bech32 characters.
    return new Response(req.method === "HEAD" ? null : '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...new Set(urls)].map(url => '<url><loc>' + url + '</loc></url>').join("") + '</urlset>', { headers });
  }
  const page = await lookup(json ? path.slice(apiPrefix.length) : path, catalog);
  if (!page) return undefined;
  const status = page.kind === "not-found" ? 404 : page.kind === "unavailable" ? 503 : 200;
  if (status === 503) headers.set("Retry-After", "60");
  if (json) headers.set("X-Robots-Tag", "noindex");
  headers.set("Content-Type", json ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  const body = req.method === "HEAD" ? null : json ? JSON.stringify(page) : renderPublicPage(await getShell(), page);
  return new Response(body, { status, headers });
}
