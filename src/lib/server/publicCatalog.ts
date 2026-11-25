import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { decode, naddrEncode } from "nostr-tools/nip19";
import { sortEvents, type NostrEvent } from "nostr-tools/pure";
import type { Filter } from "nostr-tools/filter";
import { createRelayPolicy } from "../../config/relayPolicy";
import { normalizeStationRouteParam } from "../share";
import { readCatalogRelay } from "./catalogRelay";

const stationKind = 31237;
const hex = /^[a-f\d]{64}$/i;
const pilotGenre = "rock";
const genreLimit = 32;
const maxConcurrentReads = 8;

export type CatalogResult<T> =
  | { status: "found"; value: T }
  | { status: "missing" }
  | { status: "unavailable" };

type Options = {
  databasePath?: string;
  relayUrl?: string;
  profileRelays?: string[];
  timeoutMs?: number;
  freshMs?: number;
};

function stationAddress(event: NostrEvent) {
  const identifier = event.tags.find(([name]) => name === "d")?.[1];
  if (identifier === undefined || Buffer.byteLength(identifier) > 255) return;
  return naddrEncode({ kind: stationKind, pubkey: event.pubkey, identifier });
}

function routePointer(input: string) {
  if (input.length > 5500) return;
  const value = normalizeStationRouteParam(input).replace(/^nostr:/i, "");
  if (hex.test(value)) return { type: "hex" as const, data: value.toLowerCase() };
  try {
    return decode(value);
  } catch {
    return;
  }
}

export function createPublicCatalog(options: Options = {}) {
  const relay = options.relayUrl ?? process.env.PUBLIC_CATALOG_RELAY_URL ?? "ws://127.0.0.1:3334";
  const policy = createRelayPolicy({ stage: "production", appRelay: "wss://relay.wavefunc.live" });
  const configuredProfiles = options.profileRelays ?? process.env.PUBLIC_CATALOG_PROFILE_RELAYS?.split(",") ??
    [policy.identityRead[0]!, policy.generalRead[0]!];
  const profileRelays = [...new Set(configuredProfiles.map((url) => url.trim()).filter(Boolean))].slice(0, 3);
  const path = options.databasePath ?? process.env.PUBLIC_CATALOG_DB ?? join(process.cwd(), ".cache", "public-catalog.sqlite");
  const timeout = options.timeoutMs ?? 2500;
  const ttl = options.freshMs ?? 5 * 60_000;
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA busy_timeout = 2000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY, json TEXT NOT NULL, checked INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS station_aliases (
      id TEXT PRIMARY KEY, address TEXT NOT NULL
    );
  `);
  const get = db.query<{ json: string; checked: number }, [string]>("SELECT json, checked FROM documents WHERE key = ?");
  const put = db.query("INSERT OR REPLACE INTO documents (key, json, checked) VALUES (?, ?, ?)");
  const remove = db.query("DELETE FROM documents WHERE key = ?");
  const getAlias = db.query<{ address: string }, [string]>("SELECT address FROM station_aliases WHERE id = ?");
  const putAlias = db.query("INSERT OR IGNORE INTO station_aliases (id, address) VALUES (?, ?)");
  const pending = new Map<string, Promise<unknown>>();
  const missing: CatalogResult<never> = { status: "missing" };
  const unavailable: CatalogResult<never> = { status: "unavailable" };
  const found = <T>(value: T): CatalogResult<T> => ({ status: "found", value });

  function remember(key: string, event: NostrEvent, checked: number) {
    if (event.kind === stationKind) putAlias.run(event.id, key);
    const saved = get.get(key);
    let latest = event;
    if (saved) {
      const old = JSON.parse(saved.json) as NostrEvent;
      latest = sortEvents([old, event])[0]!;
      checked = Math.max(saved.checked, checked);
    }
    put.run(key, JSON.stringify(latest), checked);
    return latest;
  }

  function singleFlight<T>(key: string, operation: () => Promise<CatalogResult<T>>, fallback: CatalogResult<T>) {
    const active = pending.get(key);
    if (active) return active as Promise<CatalogResult<T>>;
    if (pending.size >= maxConcurrentReads) return Promise.resolve(fallback);
    const task = operation().catch(() => fallback).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }

  function detail(key: string, filter: Filter, relays: string[]): Promise<CatalogResult<NostrEvent>> {
    const saved = get.get(key);
    const fallback = saved ? found(JSON.parse(saved.json) as NostrEvent) : unavailable;
    if (saved && saved.checked > Date.now() - ttl) return Promise.resolve(fallback);
    return singleFlight(key, async () => {
      const responses = await Promise.allSettled(relays.map((url) => readCatalogRelay(url, filter, timeout)));
      const events = responses.flatMap((r) => r.status === "fulfilled" ? r.value : []);
      const complete = responses.length > 0 && responses.every((r) => r.status === "fulfilled");
      if (events.length === 0) {
        if (!complete) return fallback;
        remove.run(key);
        return missing;
      }
      // Filters can match any d tag. The first one supplies the NIP-01 coordinate.
      if (events.some((event) => event.kind === stationKind && stationAddress(event) !== key)) return fallback;
      const newest = sortEvents(events)[0]!;
      return found(remember(key, newest, Date.now()));
    }, fallback);
  }

  function byAddress(input: { pubkey: string; identifier: string }) {
    const { pubkey, identifier } = input;
    const address = naddrEncode({ kind: stationKind, pubkey, identifier });
    return detail(address, { kinds: [stationKind], authors: [pubkey], "#d": [identifier], limit: 1 }, [relay]);
  }

  async function station(param: string): Promise<CatalogResult<NostrEvent>> {
    const pointer = routePointer(param);
    if (pointer?.type === "naddr") {
      if (pointer.data.kind !== stationKind) return missing;
      return byAddress(pointer.data);
    }
    let id: string;
    if (pointer?.type === "hex" || pointer?.type === "note") id = pointer.data;
    // nevent's optional author and kind are hints; the signed event is authoritative.
    else if (pointer?.type === "nevent") id = pointer.data.id;
    else return missing;
    const alias = getAlias.get(id);
    if (alias) return byAddress(decode(alias.address as `naddr1${string}`).data);

    // An exact event lookup learns the stable address even for an older version.
    // Then ask for the current addressable event regardless of that version's age.
    const result = await singleFlight("id:" + id, async () => {
      const [event] = await readCatalogRelay(relay, { kinds: [stationKind], ids: [id], limit: 1 }, timeout);
      if (!event) return missing;
      const address = stationAddress(event);
      if (!address) return unavailable;
      db.transaction(() => remember(address, event, 0))();
      return found(address);
    }, unavailable);
    if (result.status !== "found") return result;
    return byAddress(decode(result.value as `naddr1${string}`).data);
  }

  async function genre(name: string): Promise<CatalogResult<NostrEvent[]>> {
    if (name !== pilotGenre) return missing;
    const key = "genre:" + name;
    const saved = get.get(key);
    const belongs = (event: NostrEvent) => event.tags.some(([tag, value, role]) =>
      tag === "c" && role === "genre" && value?.toLowerCase() === name);
    const loadStations = (addresses: string[]) => addresses.flatMap((addr) => {
      const record = get.get(addr);
      if (!record) return [];
      const event = JSON.parse(record.json) as NostrEvent;
      return belongs(event) ? [event] : [];
    });
    const fallback = saved ? found(loadStations(JSON.parse(saved.json))) : unavailable;
    if (saved && saved.checked > Date.now() - ttl) return fallback;
    return singleFlight(key, async () => {
      const events = await readCatalogRelay(relay, {
        kinds: [stationKind], "#c": ["rock", "Rock", "ROCK"], limit: genreLimit,
      }, timeout);
      const addresses = new Set<string>();
      db.transaction(() => {
        const checked = Date.now();
        for (const event of sortEvents(events)) {
          const address = stationAddress(event);
          if (address && belongs(event)) {
            remember(address, event, checked);
            addresses.add(address);
          }
        }
        put.run(key, JSON.stringify([...addresses]), checked);
      })();
      return found(loadStations([...addresses]));
    }, fallback);
  }

  async function profile(param: string): Promise<CatalogResult<NostrEvent>> {
    const pointer = routePointer(param);
    let pubkey: string;
    if (pointer?.type === "hex" || pointer?.type === "npub") pubkey = pointer.data;
    else if (pointer?.type === "nprofile") pubkey = pointer.data.pubkey;
    else return missing;
    return detail("profile:" + pubkey, { kinds: [0], authors: [pubkey], limit: 1 }, profileRelays);
  }

  return { station, genre, profile, close: () => db.close() };
}

export type PublicCatalog = ReturnType<typeof createPublicCatalog>;
