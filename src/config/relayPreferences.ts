import { BehaviorSubject } from "rxjs";

export type PersonalRelay = { url: string; read: boolean; write: boolean };
type Snapshot = { pubkey: string | null; relays: PersonalRelay[] | null };

export function normalizePersonalRelays(relays: PersonalRelay[]): PersonalRelay[] {
  const entries = new Map<string, PersonalRelay>();
  for (const relay of relays) {
    const url = new URL(relay.url.trim());
    if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error("Use a ws:// or wss:// relay URL without credentials or a fragment");
    }
    if (!relay.read && !relay.write) throw new Error("Each relay must allow reading or writing");
    const normalized = url.toString().replace(/\/$/, "");
    const previous = entries.get(normalized);
    entries.set(normalized, { url: normalized, read: relay.read || !!previous?.read, write: relay.write || !!previous?.write });
  }
  if (entries.size > 12) throw new Error("Choose at most 12 personal relays");
  return [...entries.values()];
}

/** Local, account-scoped preferences. Saving never publishes a relay-list event. */
export class RelayPreferences {
  readonly state$ = new BehaviorSubject<Snapshot>({ pubkey: null, relays: null });
  constructor(private storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {}
  setAccount(pubkey: string | null) {
    if (pubkey === this.state$.value.pubkey) return;
    let relays: PersonalRelay[] | null = null;
    try {
      const raw = pubkey && this.storage?.getItem(`wavefunc:relays:${pubkey}`);
      if (raw) relays = normalizePersonalRelays(JSON.parse(raw));
    } catch { /* Corrupt or unavailable local storage falls back to defaults. */ }
    this.state$.next({ pubkey, relays });
  }
  save(relays: PersonalRelay[] | null) {
    const { pubkey } = this.state$.value;
    if (!pubkey) throw new Error("Sign in to edit your personal relays");
    const normalized = relays && normalizePersonalRelays(relays);
    if (normalized && (!normalized.some(r => r.read) || !normalized.some(r => r.write))) {
      throw new Error("Keep at least one read relay and one write relay");
    }
    if (normalized) this.storage?.setItem(`wavefunc:relays:${pubkey}`, JSON.stringify(normalized));
    else this.storage?.removeItem(`wavefunc:relays:${pubkey}`);
    this.state$.next({ pubkey, relays: normalized });
  }
}

const globals = globalThis as typeof globalThis & { __wavefuncRelayPreferences?: RelayPreferences };
let storage: Storage | undefined;
try { storage = globalThis.localStorage; } catch { /* unavailable in private browsing */ }
export const relayPreferences = globals.__wavefuncRelayPreferences ??= new RelayPreferences(storage);
