import { verifyEvent, type NostrEvent } from "nostr-tools/pure";
import { eventStore } from "./nostr/store";
import { genrePath, genresPath, type GenreEntry } from "./genres";
import type { PublicPage } from "./publicPageMetadata";
import { isFavoritesListEvent } from "./nostr/domain/favorites-list";

let initial: { path: string; page: PublicPage } | undefined;

function seed(events: NostrEvent[]) {
  for (const event of events) {
    if (!verifyEvent(event)) throw new Error("Invalid public directory event");
    eventStore.add(event);
  }
}

export function readInitialDirectory() {
  const element = document.getElementById("wavefunc-public-data");
  if (!element) return;
  try {
    const data = JSON.parse(element.textContent || "{}") as {
      events?: NostrEvent[]; genres?: GenreEntry[]; genre?: GenreEntry; page?: number; query?: string; total?: number;
    };
    const events = data.events ?? [];
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const kind = element.dataset.kind;
    seed(events);
    let page: PublicPage;
    if (kind === "station" && events[0]?.kind === 31237) page = { kind, event: events[0] };
    else if (kind === "collection" && events[0] && isFavoritesListEvent(events[0])) page = { kind, event: events[0], stations: events.slice(1) };
    else if (kind === "profile" && events[0]?.kind === 0) page = { kind, pubkey: events[0].pubkey, event: events[0] };
    else if (kind === "genres" && data.genres && data.page && data.query !== undefined && data.total !== undefined)
      page = { kind, genres: data.genres, page: data.page, query: data.query, total: data.total };
    else if (kind === "genre" && data.genre && data.page) page = { kind, events, genre: data.genre, page: data.page };
    else if (kind === "home" || kind === "apps") page = { kind };
    else if (kind === "unavailable" || kind === "not-found") page = { kind, path };
    else return;
    const initialPath = page.kind === "genre" ? genrePath(page.genre.slug, page.page)
      : page.kind === "genres" ? genresPath(page.page, page.query) : path + location.search;
    initial = { path: initialPath, page };
  } catch {
    // The client can still load its usual relay data if the initial document was interrupted.
  }
}

export async function loadDirectory(path: string, signal?: AbortSignal): Promise<PublicPage> {
  const firstVisit = initial;
  initial = undefined;
  if (firstVisit?.path === path) return firstVisit.page;
  try {
    const response = await fetch("/api/directory" + path, { signal, headers: { Accept: "application/json" } });
    const page: PublicPage = await response.json();
    if (page.kind === "station") seed([page.event]);
    else if (page.kind === "collection" && isFavoritesListEvent(page.event)) seed([page.event, ...page.stations]);
    else if (page.kind === "profile") seed(page.event ? [page.event] : []);
    else if (page.kind === "genre") seed(page.events);
    else if (page.kind !== "genres" && page.kind !== "not-found" && page.kind !== "unavailable") return { kind: "unavailable", path };
    return page;
  } catch {
    return { kind: "unavailable", path };
  }
}
