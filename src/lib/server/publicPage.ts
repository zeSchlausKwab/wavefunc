import type { NostrEvent } from "applesauce-core/helpers/event";
import { GENRE_INDEX_PAGE_SIZE, GENRE_PAGE_SIZE, genrePath, genresPath, stationGenres } from "../genres";
import { parseStationEvent } from "../nostr/domain/station";
import { describePublicPage, getPublicMetaTags, publicStationPath, publicWebUrl, type PublicPage } from "../publicPageMetadata";

export type { PublicPage } from "../publicPageMetadata";

const escape = Bun.escapeHTML;

function stationDetails(event: NostrEvent): string {
  const station = parseStationEvent(event);
  const facts = [
    ["Location", [station.location, station.countryCode].filter(Boolean).join(", ")],
    ["Languages", station.languages.join(", ")],
  ] as const;
  const details = facts.filter(([, value]) => value)
    .map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join("");
  const website = publicWebUrl(station.website);
  const streams = Array.isArray(station.streams) ? station.streams : [];
  const stream = publicWebUrl(streams.find(stream => stream?.primary)?.url) ?? streams.map(stream => publicWebUrl(stream?.url)).find(Boolean);
  const genres = stationGenres(station.genres).map(genre => `<a href="${escape(genrePath(genre.slug))}">${escape(genre.name)}</a>`);
  return `<dl>${genres.length ? "<dt>Genres</dt><dd>" + genres.join(", ") + "</dd>" : ""}${details}</dl>
    ${stream ? `<p><a href="${escape(stream)}">Listen live</a></p>` : ""}
    ${website ? `<p><a href="${escape(website)}" rel="ugc">Station website</a></p>` : ""}`;
}

function pagination(page: number, pages: number, label: string, href: (number: number) => string) {
  if (pages <= 1) return "";
  const link = (number: number, title: string) => `<a href="${escape(href(number))}">${title}</a>`;
  return `<nav aria-label="${label}">
    ${page > 1 ? link(page - 1, "Previous page") : ""}
    <span>Page ${page} of ${pages}</span>
    ${page < pages ? link(page + 1, "Next page") : ""}
  </nav>`;
}

function pageDetails(page: PublicPage): string {
  switch (page.kind) {
    case "station":
      return stationDetails(page.event);
    case "genres": {
      const links = page.genres.map(genre => `<li><a href="${escape(genrePath(genre.slug))}">${escape(genre.name)}</a> (${genre.count})</li>`).join("");
      const nav = pagination(page.page, Math.ceil(page.total / GENRE_INDEX_PAGE_SIZE), "Genre pages", n => genresPath(n, page.query));
      return `<form action="/browse/genres" method="get"><input type="search" name="q" aria-label="Search genres" value="${escape(page.query)}"><button>Search</button></form>
        ${links ? "<ul>" + links + "</ul>" : "<p>No genres found.</p>"}${nav}`;
    }
    case "genre": {
      const list = page.events.map(event => {
        const station = parseStationEvent(event);
        return `<li><a href="${escape(publicStationPath(event))}">${escape(station.name || "Radio station")}</a></li>`;
      }).join("");
      const pages = Math.ceil(page.genre.count / GENRE_PAGE_SIZE);
      return `<ul>${list}</ul>${pagination(page.page, pages, "Station pages", n => genrePath(page.genre.slug, n))}`;
    }
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
  const data = page.kind === "genres" || page.kind === "genre" ? page : { events: pageEvents(page) };
  const json = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
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
    <nav aria-label="Radio directory" class="flex flex-wrap gap-4 underline"><a href="/">WaveFunc Radio</a><a href="/browse/genres">Browse genres</a><a href="/apps">WaveFunc apps</a></nav>
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
