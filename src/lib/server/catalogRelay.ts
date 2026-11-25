import { matchFilter, type Filter } from "nostr-tools/filter";
import { validateEvent, verifyEvent, type NostrEvent } from "nostr-tools/pure";

// Only a real EOSE completes a catalog read. A disconnect, timeout or CLOSED
// frame must never become a permanent "not found" or erase a saved snapshot.
export function readCatalogRelay(url: string, filter: Filter, timeoutMs: number): Promise<NostrEvent[]> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const subscription = "wavefunc-catalog";
    const events: NostrEvent[] = [];
    let messages = 0;
    let settled = false;
    const timer = setTimeout(() => finish(false), timeoutMs);

    function finish(complete: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (complete) resolve(events);
      else reject(new Error("Catalog relay read incomplete"));
    }

    socket.onopen = () => socket.send(JSON.stringify(["REQ", subscription, filter]));
    socket.onerror = socket.onclose = () => finish(false);
    socket.onmessage = ({ data }) => {
      if (settled) return;
      if (typeof data !== "string" || data.length > 256 * 1024 || ++messages > (filter.limit ?? 1) + 8) {
        return finish(false);
      }
      try {
        const [type, id, event] = JSON.parse(data);
        if (id !== subscription) return;
        if (type === "EOSE") return finish(true);
        if (type === "CLOSED") return finish(false);
        if (type !== "EVENT") return;
        if (events.length >= (filter.limit ?? 1) || !validateEvent(event) ||
            !matchFilter(filter, event) || !verifyEvent(event)) return finish(false);
        events.push(event);
      } catch {
        finish(false);
      }
    };
  });
}
