import type { NostrEvent } from "applesauce-core/helpers/event";
import { matchFilter, type Filter } from "applesauce-core/helpers/filter";
import type { EventCache } from "./queryRegistry";

type CachedRecord = {
  key: string;
  scope: string;
  kind: number;
  pubkey: string;
  event: NostrEvent;
  cachedAt: number;
};

const DATABASE_NAME = "wavefunc-nostr-cache";
const STORE_NAME = "events";
const DATABASE_VERSION = 1;
const MAX_EVENT_AGE_MS = 30 * 24 * 60 * 60_000;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function uniqueEvents(events: NostrEvent[]): NostrEvent[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

/**
 * Small persistent cache adapter for Applesauce loaders and shared queries.
 * Records are partitioned by stage/app-relay scope, preventing development
 * fixtures from ever satisfying production queries.
 */
export class IndexedDBEventCache implements EventCache {
  private database?: Promise<IDBDatabase | null>;

  private open(): Promise<IDBDatabase | null> {
    if (this.database) return this.database;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);

    const database = new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE_NAME, {
          keyPath: "key",
        });
        store.createIndex("scope", "scope");
        store.createIndex("scope-kind", ["scope", "kind"]);
        store.createIndex("scope-kind-pubkey", ["scope", "kind", "pubkey"]);
        store.createIndex("cachedAt", "cachedAt");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open Nostr cache"));
      request.onblocked = () => resolve(null);
    }).catch((error): null => {
      console.warn("Persistent Nostr cache is unavailable:", error);
      return null;
    });

    this.database = database;
    return database;
  }

  async put(event: NostrEvent, scope: string): Promise<void> {
    const database = await this.open();
    if (!database) return;
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const record: CachedRecord = {
      key: `${scope}:${event.id}`,
      scope,
      kind: event.kind,
      pubkey: event.pubkey,
      event,
      cachedAt: Date.now(),
    };
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  }

  async remove(event: NostrEvent, scope: string): Promise<void> {
    const database = await this.open();
    if (!database) return;
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(`${scope}:${event.id}`);
    await transactionDone(transaction);
  }

  async query(scope: string, filters: Filter[]): Promise<NostrEvent[]> {
    if (filters.length === 0) return [];
    const database = await this.open();
    if (!database) return [];

    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const records: CachedRecord[] = [];

    for (const filter of filters) {
      if (filter.kinds?.length && filter.authors?.length) {
        const index = store.index("scope-kind-pubkey");
        for (const kind of filter.kinds) {
          for (const author of filter.authors) {
            records.push(
              ...(await requestResult(
                index.getAll(IDBKeyRange.only([scope, kind, author])),
              )),
            );
          }
        }
      } else if (filter.kinds?.length) {
        const index = store.index("scope-kind");
        for (const kind of filter.kinds) {
          records.push(
            ...(await requestResult(index.getAll(IDBKeyRange.only([scope, kind])))),
          );
        }
      } else {
        records.push(
          ...(await requestResult(store.index("scope").getAll(IDBKeyRange.only(scope)))),
        );
      }
    }

    const fresh = records.filter(
      (record) => Date.now() - record.cachedAt <= MAX_EVENT_AGE_MS,
    );
    const matching: NostrEvent[] = [];
    for (const filter of filters) {
      const events = fresh
        .map((record) => record.event)
        .filter((event) => matchFilter(filter, event))
        .sort((a, b) => b.created_at - a.created_at);
      matching.push(...(filter.limit ? events.slice(0, filter.limit) : events));
    }
    return uniqueEvents(matching);
  }
}
