import type { NostrEvent } from "applesauce-core/helpers/event";
import { matchFilter, type Filter } from "applesauce-core/helpers/filter";
import { addSeenRelay, getSeenRelays } from "applesauce-core/helpers/relays";
import type { EventCache } from "./queryRegistry";

type CachedRecord = {
  key: string;
  scope: string;
  kind: number;
  pubkey: string;
  event: NostrEvent;
  cachedAt: number;
  seenRelays?: string[];
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
  private pending = new Map<string, CachedRecord | null>();
  private scheduled?: Promise<void>;
  private writes = Promise.resolve();
  private lastPruned = 0;

  private schedule(): Promise<void> {
    return this.scheduled ??= new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        this.scheduled = undefined;
        const batch = this.pending;
        this.pending = new Map();
        const write = this.writes.catch(() => {}).then(async () => {
          const database = await this.open();
          if (!database) return;
          const transaction = database.transaction(STORE_NAME, "readwrite");
          const done = transactionDone(transaction);
          const store = transaction.objectStore(STORE_NAME);
          for (const [key, record] of batch) {
            if (record) store.put(record);
            else store.delete(key);
          }
          await done;
          if (Date.now() - this.lastPruned > 60_000) {
            await this.prune(database);
            this.lastPruned = Date.now();
          }
        });
        this.writes = write;
        void write.then(resolve, reject);
      }, 25);
    });
  }

  /** Bound this disposable event cache; wallet operation recovery uses a separate database. */
  private async prune(database: IDBDatabase) {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const count = store.count();
    count.onsuccess = () => {
      let excess = Math.max(0, count.result - 20_000);
      const cursor = store.index("cachedAt").openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (excess > 0 || entry.value.cachedAt < Date.now() - MAX_EVENT_AGE_MS) {
          entry.delete();
          excess = Math.max(0, excess - 1);
          entry.continue();
        }
      };
    };
    await done;
  }

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
    const key = `${scope}:${event.id}`;
    // Persist only signed wire fields; Applesauce's helper/decryption caches stay in memory.
    const { id, pubkey, sig, kind, created_at, content, tags } = event;
    this.pending.set(key, {
      key, scope, kind, pubkey, event: { id, pubkey, sig, kind, created_at, content, tags },
      cachedAt: Date.now(), seenRelays: [...(getSeenRelays(event) ?? [])],
    });
    return this.schedule();
  }

  async remove(event: NostrEvent, scope: string): Promise<void> {
    this.pending.set(`${scope}:${event.id}`, null);
    return this.schedule();
  }

  async query(scope: string, filters: Filter[]): Promise<NostrEvent[]> {
    if (filters.length === 0) return [];
    await this.scheduled;
    await this.writes.catch(() => {});
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

    const fresh = [...new Map(records.map(record => [record.key, record])).values()].filter(
      (record) => Date.now() - record.cachedAt <= MAX_EVENT_AGE_MS,
    );
    for (const record of fresh) {
      for (const relay of record.seenRelays ?? []) {
        try { addSeenRelay(record.event, relay); } catch { /* Ignore old malformed provenance. */ }
      }
    }
    const matching: NostrEvent[] = [];
    for (const filter of filters) {
      const events = fresh
        .map((record) => record.event)
        .filter((event) => matchFilter(filter, event))
        .sort((a, b) => b.created_at - a.created_at);
      matching.push(...(filter.limit !== undefined ? events.slice(0, filter.limit) : events));
    }
    return uniqueEvents(matching);
  }
}
