import { describe, expect, test } from "bun:test";
import { finalizeEvent, verifyEvent } from "nostr-tools/pure";
import { naddrEncode, npubEncode } from "nostr-tools/nip19";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { renderPublicPage, type PublicPage } from "../src/lib/server/publicPage";

const shell = '<html><head><meta name="google-site-verification" content="example"><title>Original</title><meta property="og:title" content="Original"><meta property="og:url" content="https://wavefunc.live"><link rel="icon" href="/favicon.ico"><script src="/bundle.js" type="module"></script></head><body><div id="root"></div></body></html>';
const secret = new Uint8Array(32).fill(1);
const image = "https://art.example/station.png";
const station = finalizeEvent({
  kind: 31237, created_at: 42,
  tags: [["d", "station"], ["name", 'Rock & "Roll"'], ["thumbnail", image], ["c", "rock", "genre"]],
  content: JSON.stringify({ description: "From </script><script>alert(1)</script> & beyond", streams: [{ url: "https://stream.example/live" }] }),
}, secret);
const stationPath = "/station/" + naddrEncode({ kind: station.kind, pubkey: station.pubkey, identifier: "station" });
const fallback = "https://wavefunc.live/images/og-image.png";

function bootstrap(html: string) {
  const match = html.match(/<script type="application\/json" id="wavefunc-public-data" data-kind="([^"]+)">([^<]*)<\/script>/);
  if (!match) throw new Error("Missing public bootstrap data");
  return { kind: match[1], events: (JSON.parse(match[2]!) as { events: NostrEvent[] }).events };
}

describe("public HTML and share previews", () => {
  test("station links include the signed metadata, canonical URL, and artwork before JavaScript runs", () => {
    const html = renderPublicPage(shell, { kind: "station", event: station });
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain('rel="canonical" href="https://wavefunc.live' + stationPath + '"');
    expect(html).toContain('property="og:url" content="https://wavefunc.live' + stationPath + '"');
    expect(html).toContain('property="og:image" content="' + image + '"');
    expect(html).toContain('property="og:logo" content="https://wavefunc.live/images/logo.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="telegram:image" content="' + image + '"');
    expect(html).toContain('href="https://stream.example/live">Listen live</a>');
    expect(html).toContain('name="google-site-verification" content="example"');
    expect(html).toContain('src="/bundle.js"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('Rock &amp; &quot;Roll&quot;');
    expect(html).not.toContain("<script>alert(1)</script>");
    const data = bootstrap(html);
    expect(data.kind).toBe("station");
    expect(data.events).toHaveLength(1);
    expect(data.events[0]?.content).toBe(station.content);
    expect(verifyEvent(data.events[0]!)).toBe(true);
  });

  test("genre and static pages contain ordinary crawlable links", () => {
    const genre = renderPublicPage(shell, { kind: "genre", events: [station] });
    expect(genre).toContain('href="' + stationPath + '"');
    expect(genre).toContain('rel="canonical" href="https://wavefunc.live/genre/rock"');
    expect(bootstrap(genre).events[0]?.id).toBe(station.id);
    const home = renderPublicPage(shell, { kind: "home" });
    expect(home).toContain('href="/genre/rock"');
    expect(home).toContain('href="/apps"');
    const apps = renderPublicPage(shell, { kind: "apps" });
    expect(apps).toContain('href="https://zapstore.dev/apps/live.wavefunc.app"');
    expect(apps).toContain('href="https://github.com/zeSchlausKwab/wavefunc/releases/latest"');
    expect(apps).toContain('name="twitter:image" content="' + fallback + '"');
  });

  test("profiles use their own display name, bio, picture and stable public key URL", () => {
    const event = finalizeEvent({
      kind: 0, created_at: 42, tags: [], content: JSON.stringify({ display_name: "DJ Jane", about: "Records & radio", picture: image }),
    }, secret);
    const html = renderPublicPage(shell, { kind: "profile", pubkey: event.pubkey, event });
    expect(html).toContain('property="og:title" content="DJ Jane | WaveFunc Radio"');
    expect(html).toContain('property="og:description" content="Records &amp; radio"');
    expect(html).toContain('name="twitter:image" content="' + image + '"');
    expect(html).toContain('rel="canonical" href="https://wavefunc.live/profile/' + npubEncode(event.pubkey) + '"');
    expect(bootstrap(html).events[0]?.id).toBe(event.id);
  });

  test("invalid image and stream data fall back safely", () => {
    const event = finalizeEvent({
      kind: 31237, created_at: 43, tags: [["d", "unsafe"], ["thumbnail", "javascript:alert(1)"], ["website", "data:text/html,X"]],
      content: JSON.stringify({ streams: "broken", description: {} }),
    }, secret);
    const html = renderPublicPage(shell, { kind: "station", event });
    expect(html).toContain('property="og:image" content="' + fallback + '"');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('content="javascript:');
    expect(html).not.toContain("[object Object]");
  });

  test("missing or unavailable pages keep their own state and cannot inherit the homepage canonical", () => {
    const previous = renderPublicPage(shell, { kind: "station", event: station });
    for (const kind of ["not-found", "unavailable"] as const) {
      const page: PublicPage = { kind, path: "//untrusted.example/path" };
      const html = renderPublicPage(previous, page);
      expect(html).toContain('name="robots" content="noindex"');
      expect(html).not.toContain('rel="canonical"');
      expect(html).not.toContain('property="og:url"');
      expect(html).not.toContain("untrusted.example");
      expect(html.match(/id="wavefunc-public-data"/g)).toHaveLength(1);
      expect(bootstrap(html)).toEqual({ kind, events: [] });
    }
  });
});
