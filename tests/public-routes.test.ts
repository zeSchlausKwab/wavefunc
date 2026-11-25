import { describe, expect, test } from "bun:test";
import { servePublicRoute } from "../src/lib/server/publicRoutes";
import type { PublicCatalog } from "../src/lib/server/publicCatalog";

const unavailable = async () => ({ status: "unavailable" } as const);
const catalog: PublicCatalog = { station: unavailable, profile: unavailable, genre: unavailable, close() {} };
const shell = async () => '<html><head></head><body><div id="root"></div></body></html>';

describe("public directory HTTP responses", () => {
  test("a cold relay outage is retryable for readers, clients, and the sitemap", async () => {
    for (const path of ["/station/example", "/genre/rock", "/api/directory/genre/rock", "/sitemap.xml"]) {
      const response = await servePublicRoute(new Request("http://localhost" + path), catalog, shell);
      expect(response?.status).toBe(503);
      expect(response?.headers.get("Retry-After")).toBe("60");
    }
  });

  test("the shell alias redirects to the public homepage with its original search", async () => {
    const response = await servePublicRoute(new Request("http://localhost/index.html?search=bagel"), catalog, shell);
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("/?search=bagel");
  });

  test("HEAD returns the public homepage headers without reading its body", async () => {
    const response = await servePublicRoute(new Request("http://localhost/", { method: "HEAD" }), catalog,
      () => { throw new Error("Unexpected shell read"); });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toMatch(/text\/html/);
    expect(response?.body).toBeNull();
  });
});
