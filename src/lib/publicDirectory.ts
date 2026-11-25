import { verifyEvent, type NostrEvent } from "nostr-tools/pure";
import { eventStore } from "./nostr/store";
import type { PublicPage } from "./publicPageMetadata";

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
    const { events } = JSON.parse(element.textContent || "{}") as { events: NostrEvent[] };
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const kind = element.dataset.kind;
    seed(events);
    let page: PublicPage;
    if (kind === "station" && events[0]?.kind === 31237) page = { kind, event: events[0] };
    else if (kind === "profile" && events[0]?.kind === 0) page = { kind, pubkey: events[0].pubkey, event: events[0] };
    else if (kind === "genre") page = { kind, events };
    else if (kind === "home" || kind === "apps") page = { kind };
    else if (kind === "unavailable" || kind === "not-found") page = { kind, path };
    else return;
    initial = { path, page };
  } catch {
    // The client can still load its usual relay data if the initial document was interrupted.
  }
}

export async function loadDirectory(path: string, signal?: AbortSignal): Promise<PublicPage> {
  if (initial?.path === path) {
    const { page } = initial;
    initial = undefined;
    return page;
  }
  try {
    const response = await fetch("/api/directory" + path, { signal, headers: { Accept: "application/json" } });
    const page: PublicPage = await response.json();
    if (page.kind === "station") seed([page.event]);
    else if (page.kind === "profile") seed(page.event ? [page.event] : []);
    else if (page.kind === "genre") seed(page.events);
    else if (page.kind !== "not-found" && page.kind !== "unavailable") return { kind: "unavailable", path };
    return page;
  } catch {
    return { kind: "unavailable", path };
  }
}
