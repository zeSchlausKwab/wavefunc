import type { EventStore } from "applesauce-core";
import type { Filter } from "applesauce-core/helpers/filter";
import type { RelayPool } from "applesauce-relay";
import { storeEvents } from "applesauce-relay/operators";

/**
 * Fetch a finite set of stored relay events and persist them in the shared
 * EventStore. RelayPool.request() completes at EOSE; subscription() deliberately
 * exposes events only and therefore cannot be used to drive initial-load state.
 */
export function requestEventsIntoStore(
  relayPool: Pick<RelayPool, "request">,
  eventStore: EventStore,
  relays: string[],
  filters: Filter[],
) {
  return relayPool.request(relays, filters).pipe(storeEvents(eventStore));
}
