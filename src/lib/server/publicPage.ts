import type { NostrEvent } from "applesauce-core/helpers/event";
import { parseStationEvent } from "../nostr/domain/station";
import { describePublicPage, getPublicMetaTags, publicStationPath, publicWebUrl, type PublicPage } from "../publicPageMetadata";

export type { PublicPage } from "../publicPageMetadata";

const escape = Bun.escapeHTML;

function stationDetails(event: NostrEvent): string {
  const station = parseStationEvent(event);
  const facts = [
    ["Genres", station.genres.join(", ")],
    ["Location", [station.location, station.countryCode].filter(Boolean).join(", ")],
    ["Languages", station.languages.join(", ")],
  ] as const;
  const details = facts.filter(([, value]) => value)
    .map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join("");
  const website = publicWebUrl(station.website);
  const streams = Array.isArray(station.streams) ? station.streams : [];
  const stream = publicWebUrl(streams.find(stream => stream?.primary)?.url) ?? streams.map(stream => publicWebUrl(stream?.url)).find(Boolean);
  return `<dl>${details}</dl>
    ${stream ? `<p><a href="${escape(stream)}">Listen live</a></p>` : ""}
    ${website ? `<p><a href="${escape(website)}" rel="ugc">Station website</a></p>` : ""}`;
}

function pageDetails(page: PublicPage): string {
  switch (page.kind) {
    case "station":
      return stationDetails(page.event);
    case "genre":
      return page.events.length
        ? `<ul>${page.events.map(event => {
          const station = parseStationEvent(event);
          return `<li><a href="${escape(publicStationPath(event))}">${escape(station.name || "Radio station")}</a></li>`;
        }).join("")}</ul>`
        : "<p>No rock stations are available at the moment.</p>";
    case "apps":
      return '<p><a href="https://zapstore.dev/apps/live.wavefunc.app">Get WaveFunc for Android on Zapstore</a></p><p><a href="https://github.com/zeSchlausKwab/wavefunc/releases/latest">Download WaveFunc for Android, macOS, Windows or Linux from GitHub</a></p>';
    default:
      return "";
  }
}

function pageEvents(page: PublicPage): NostrEvent[] {
  if (page.kind === "genre") return page.events;
  if (page.kind === "station") return [page.event];
  if (page.kind === "profile" && page.event) return [page.event];
  return [];
}

/** Script raw text doesn't decode HTML entities. Use JSON escapes to preserve signed bytes. */
function eventData(page: PublicPage): string {
  const json = JSON.stringify({ events: pageEvents(page) }).replace(/[<>&\u2028\u2029]/g, char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
  return `<script type="application/json" id="wavefunc-public-data" data-kind="${page.kind}">${json}</script>`;
}

/** Decorate the built app shell for the first HTTP response, regardless of user agent. */
export function renderPublicPage(shell: string, page: PublicPage): string {
  const metadata = describePublicPage(page);
  const tags = getPublicMetaTags(metadata);
  const managed = new Set(["og:url", "robots", ...tags.map(tag => tag.key)]);
  const head = [
    `<title>${escape(metadata.title)}</title>`,
    ...tags.map(({ attribute, key, content }) => `<meta ${attribute}="${key}" content="${escape(content)}">`),
    metadata.canonical ? `<link rel="canonical" href="${escape(metadata.canonical)}">` : "",
  ].join("\n");
  const main = `<main class="mx-auto max-w-5xl space-y-6 p-6">
    <h1 class="font-headline text-3xl font-black">${escape(metadata.heading)}</h1>
    <p>${escape(metadata.description)}</p>
    ${pageDetails(page)}
    <nav aria-label="Radio directory" class="flex flex-wrap gap-4 underline"><a href="/">WaveFunc Radio</a><a href="/genre/rock">Rock radio stations</a><a href="/apps">WaveFunc apps</a></nav>
  </main>`;
  return new HTMLRewriter()
    .on("head > title", { element(el) { el.remove(); } })
    .on('head > link[rel="canonical"]', { element(el) { el.remove(); } })
    .on("head > meta", { element(el) {
      const key = el.getAttribute("property") ?? el.getAttribute("name");
      if (key && managed.has(key)) el.remove();
    } })
    .on("head", { element(el) { el.append(head, { html: true }); } })
    .on("#wavefunc-public-data", { element(el) { el.remove(); } })
    .on("#root", { element(el) {
      el.before(eventData(page), { html: true });
      el.setInnerContent(main, { html: true });
    } })
    .transform(shell);
}
