import type { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import type { Observable, Subscription } from "rxjs";

export type EventCache = {
  query(scope: string, filters: Filter[]): Promise<NostrEvent[]>;
  put(event: NostrEvent, scope: string): Promise<void>;
  remove?(event: NostrEvent, scope: string): Promise<void>;
};

export type RelayQuerySnapshot = {
  ready: boolean;
  source: "none" | "memory" | "cache" | "relay";
  error?: Error;
};

export type RelayQueryInput = {
  scope: string;
  relays: string[];
  filters: Filter[];
  live?: boolean;
};

type QueryDependencies = {
  eventStore: EventStore;
  cache: EventCache;
  request(relays: string[], filters: Filter[]): Observable<NostrEvent>;
  subscription(relays: string[], filters: Filter[]): Observable<NostrEvent>;
  retainForMs?: number;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function queryKey(input: RelayQueryInput): string {
  return stable({
    scope: input.scope,
    relays: Array.from(new Set(input.relays)).sort(),
    filters: input.filters,
    live: input.live !== false,
  });
}

export class RelayQuery {
  private snapshot: RelayQuerySnapshot;
  private readonly listeners = new Set<() => void>();
  private requestSubscription?: Subscription;
  private liveSubscription?: Subscription;
  private started = false;
  private stopped = false;

  constructor(
    private readonly input: RelayQueryInput,
    private readonly dependencies: QueryDependencies,
  ) {
    const warm = dependencies.eventStore.getByFilters(input.filters).length > 0;
    this.snapshot = warm
      ? { ready: true, source: "memory" }
      : { ready: false, source: "none" };
  }

  getSnapshot = (): RelayQuerySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.stopped) return () => undefined;
    this.listeners.add(listener);
    if (!this.started) this.start();
    return () => this.listeners.delete(listener);
  };

  private update(next: RelayQuerySnapshot) {
    if (
      this.snapshot.ready === next.ready &&
      this.snapshot.source === next.source &&
      this.snapshot.error === next.error
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private addEvent(event: NostrEvent, source: "cache" | "relay") {
    this.dependencies.eventStore.add(event, this.input.relays[0]);
    if (source === "relay") {
      void this.dependencies.cache.put(event, this.input.scope).catch(() => {
        // A cache write must never break a live relay query.
      });
    }
  }

  private start() {
    this.started = true;

    void this.dependencies.cache
      .query(this.input.scope, this.input.filters)
      .then((events) => {
        if (this.stopped) return;
        for (const event of events) this.addEvent(event, "cache");
        if (events.length > 0 && !this.snapshot.ready) {
          this.update({ ready: true, source: "cache" });
        }
      })
      .catch(() => {
        // Cache misses and unavailable IndexedDB fall through to the relay.
      });

    this.requestSubscription = this.dependencies
      .request(this.input.relays, this.input.filters)
      .subscribe({
        next: (event) => {
          this.addEvent(event, "relay");
          if (!this.snapshot.ready) {
            this.update({ ready: true, source: "relay" });
          }
        },
        complete: () => {
          if (!this.snapshot.ready) {
            this.update({ ready: true, source: "relay" });
          }
        },
        error: (value) => {
          const error = value instanceof Error ? value : new Error(String(value));
          this.update({ ready: true, source: this.snapshot.source, error });
        },
      });

    if (this.input.live !== false) {
      this.liveSubscription = this.dependencies
        .subscription(this.input.relays, this.input.filters)
        .subscribe({
          next: (event) => this.addEvent(event, "relay"),
          error: () => {
            // The bounded request owns initial readiness. A later live socket
            // failure should not turn cached content back into a loading screen.
          },
        });
    }
  }

  stop() {
    this.stopped = true;
    this.requestSubscription?.unsubscribe();
    this.liveSubscription?.unsubscribe();
    this.listeners.clear();
  }
}

export class RelayQueryRegistry {
  private readonly queries = new Map<string, RelayQuery>();
  private readonly releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retainForMs: number;

  constructor(private readonly dependencies: QueryDependencies) {
    this.retainForMs = dependencies.retainForMs ?? 5 * 60_000;
  }

  query(input: RelayQueryInput): RelayQuery {
    const key = queryKey(input);
    const existing = this.queries.get(key);
    if (existing) return existing;

    const query = new RelayQuery(input, this.dependencies);
    const originalSubscribe = query.subscribe;
    let subscribers = 0;
    query.subscribe = (listener) => {
      subscribers += 1;
      const timer = this.releaseTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.releaseTimers.delete(key);
      }
      const unsubscribe = originalSubscribe(listener);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        unsubscribe();
        subscribers -= 1;
        if (subscribers === 0 && !this.releaseTimers.has(key)) {
          const releaseTimer = setTimeout(() => {
            if (subscribers === 0) {
              query.stop();
              this.queries.delete(key);
            }
            this.releaseTimers.delete(key);
          }, this.retainForMs);
          this.releaseTimers.set(key, releaseTimer);
        }
      };
    };

    this.queries.set(key, query);
    return query;
  }

  dispose() {
    for (const timer of this.releaseTimers.values()) clearTimeout(timer);
    this.releaseTimers.clear();
    for (const query of this.queries.values()) query.stop();
    this.queries.clear();
  }
}
