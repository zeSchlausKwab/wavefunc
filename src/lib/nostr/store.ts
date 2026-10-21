/**
 * Wavefunc nostr singletons.
 *
 * Owns the EventStore, RelayPool, AccountManager, ActionRunner, and the Cashu
 * operation couch. All instances live on `globalThis` so they
 * survive Bun's HMR (otherwise we'd leak WebSocket connections on every save).
 *
 * The React layer in `runtime.tsx` reads from these singletons and exposes
 * them via context for components that prefer hook-based access.
 */

// Side-effect: registers the wallet$ getter on the User cast so
// `castUser(pubkey, eventStore).wallet$` resolves to the NIP-60 wallet.
import "applesauce-wallet/casts";

import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { RelayLiveness, RelayPool } from "applesauce-relay";
import {
  createReactionsLoader,
  createTagValueLoader,
  createZapsLoader,
} from "applesauce-loaders/loaders";
import { NostrConnectSigner } from "applesauce-signers";
import { AccountManager } from "applesauce-accounts";
import {
  registerCommonAccountTypes,
  ExtensionAccount,
  PrivateKeyAccount,
  NostrConnectAccount,
} from "applesauce-accounts/accounts";
import { ActionRunner } from "applesauce-actions";
import {
  LocalStorageCouch,
  WALLET_KIND,
  getWalletRelays,
} from "applesauce-wallet/helpers";
import type { Couch } from "applesauce-wallet/helpers";
import { map, merge, Subject, tap } from "rxjs";
import {
  getNostrCacheScope,
  getRelayPolicy,
  getSocialRelayUrls,
  getWalletRelayUrls,
} from "../../config/nostr";
import { relayPreferences } from "../../config/relayPreferences";
import { selectPublishRelays } from "../../config/relayPolicy";
import { getInboxes, getOutboxes } from "applesauce-core/helpers/mailboxes";
import { publishAccepted, relayAuthentication } from "./transport";
import { SOCIAL_EVENT_KINDS } from "./social";
import { IndexedDBEventCache } from "./eventCache";
import { attachEventLoading } from "./eventLoading";
import { RelayQueryRegistry } from "./queryRegistry";
import { WalletCouch, createCouchMigration } from "./walletCouch";

const ACCOUNTS_STORAGE_KEY = "wavefunc:accounts:v1";
const ACTIVE_ACCOUNT_STORAGE_KEY = "wavefunc:active-account:v1";
const COUCH_STORAGE_KEY = "wavefunc:cashu-couch";

/**
 * Public, well-known relays used as the default `relays` field on a freshly
 * created NIP-60 wallet event. These are the relays *other* clients will look
 * at to find the wallet's events, so they should be reachable from anywhere
 * (no localhost). Users can edit this list later via the wallet settings UI.
 */
export const DEFAULT_RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.wine",
  "wss://relay.minibits.cash",
  "wss://relay.coinos.io",
];

export type AccountMetadata = {
  name?: string;
};

// ── HMR-safe singletons ──────────────────────────────────────────────────────
interface NostrGlobals {
  eventStore?: EventStore;
  relayPool?: RelayPool;
  liveness?: RelayLiveness;
  couch?: Couch;
  durableCouch?: WalletCouch;
  migrateCouch?: ReturnType<typeof createCouchMigration>;
  accounts?: AccountManager<AccountMetadata>;
  actions?: ActionRunner;
  publishedEvents?: Subject<NostrEvent>;
  socialReadErrors?: Subject<{ values: string[]; error: unknown }>;
  accountListenersAttached?: boolean;
  eventLoading?: ReturnType<typeof attachEventLoading>;
  eventCache?: IndexedDBEventCache;
  eventCacheAttached?: boolean;
  queryRegistry?: RelayQueryRegistry;
}
const g = globalThis as typeof globalThis & { __wavefuncNostr?: NostrGlobals };
g.__wavefuncNostr ??= {};

export const publishedEvents$ = g.__wavefuncNostr.publishedEvents ??= new Subject<NostrEvent>();

// EventStore
export const eventStore: EventStore = (g.__wavefuncNostr.eventStore ??=
  new EventStore());

export const relayLiveness = g.__wavefuncNostr.liveness ??= new RelayLiveness();

// RelayPool — also wires NostrConnectSigner pool fallback so bunker signers
// can communicate without per-call configuration.
export const relayPool: RelayPool = (g.__wavefuncNostr.relayPool ??= (() => {
  const pool = new RelayPool({ liveness: relayLiveness });
  NostrConnectSigner.pool = pool;
  return pool;
})());

export const eventCache: IndexedDBEventCache = (g.__wavefuncNostr.eventCache ??=
  new IndexedDBEventCache());

g.__wavefuncNostr.eventLoading ??= attachEventLoading(eventStore, relayPool, eventCache);

// Every verified event that enters Applesauce's canonical store becomes
// available to the next route immediately, including after an app restart.
if (!g.__wavefuncNostr.eventCacheAttached) {
  g.__wavefuncNostr.eventCacheAttached = true;
  eventStore.insert$.subscribe((event) => {
    void eventCache.put(event, getNostrCacheScope()).catch(() => {
      // IndexedDB can be unavailable in privacy modes; relay reads continue.
    });
  });
  eventStore.remove$.subscribe((event) => {
    void eventCache.remove(event, getNostrCacheScope()).catch(() => {
      // Cache invalidation is best-effort; the relay remains authoritative.
    });
  });
}

export const relayQueries: RelayQueryRegistry = (g.__wavefuncNostr.queryRegistry ??=
  new RelayQueryRegistry({
    eventStore,
    cache: eventCache,
    request: (relays, filters) => relayPool.request(relays, filters, { waitForAuth: false }),
    subscription: (relays, filters) => relayPool.subscription(relays, filters, { waitForAuth: false }),
  }));

// Shared, batched social loaders. A loader instance buffers tag lookups from
// all visible station cards into a small number of relay requests instead of
// opening one subscription per card. Public relays are required here because
// the WaveFunc station mirror does not mirror every reaction/zap event.
export const socialReadErrors$ = g.__wavefuncNostr.socialReadErrors ??= new Subject<{ values: string[]; error: unknown }>();
// Tag loaders isolate individual relay failures. Preserve target-specific failure
// information so an exhausted fallback is not presented as a known zero.
const socialPool = {
  request: (relays: string[], filters: Parameters<RelayPool["request"]>[1]) => relayPool.request(relays, filters, { waitForAuth: false, timeout: 8_000 }).pipe(tap({
    error: error => socialReadErrors$.next({ values: (Array.isArray(filters) ? filters : [filters]).flatMap(filter => Object.entries(filter).filter(([key]) => ["#a", "#A", "#e", "#E"].includes(key)).flatMap(([, value]) => value as string[])), error }),
  })),
};
const socialLoaderOptions = {
  bufferTime: 100,
  bufferSize: 200,
  extraRelays: relayPreferences.state$.pipe(map(() => getSocialRelayUrls())),
  eventStore,
  cacheRequest: (filters: Parameters<IndexedDBEventCache["query"]>[1]) =>
    eventCache.query(getNostrCacheScope(), filters),
};
const walletSocialLoaderOptions = {
  ...socialLoaderOptions,
  // This loader only ever requests kind 9321, which is appropriate for the
  // wallet-specialist relays. Likes and comments never use these relays.
  extraRelays: getWalletRelayUrls(),
};

export const loadReactions = createReactionsLoader(
  socialPool,
  socialLoaderOptions,
);
export const loadLightningZaps = createZapsLoader(
  socialPool,
  socialLoaderOptions,
);
export const loadSocialByEvent = createTagValueLoader(socialPool, "e", {
  ...socialLoaderOptions,
  kinds: SOCIAL_EVENT_KINDS.filter(kind => kind !== 1111),
});
export const loadNutzapsByAddress = createTagValueLoader(socialPool, "a", {
  ...walletSocialLoaderOptions,
  kinds: [9321],
});
export const loadCommentsByAddress = createTagValueLoader(socialPool, "A", {
  ...socialLoaderOptions,
  kinds: [1111],
});

export const loadLegacyCommentsByAddress = createTagValueLoader(socialPool, "a", { ...socialLoaderOptions, kinds: [1111] });
export const loadCommentsByEvent = createTagValueLoader(socialPool, "E", { ...socialLoaderOptions, kinds: [1111] });

// Cashu couch — IndexedDB is the wallet's durable backup for in-flight
// operations. Migrate any stranded tokens from the previous localStorage
// couch before the NutWallet starts so an upgrade cannot orphan funds.
export const couch = g.__wavefuncNostr.durableCouch ??= new WalletCouch();
export const migrateLegacyCouch = g.__wavefuncNostr.migrateCouch ??=
  createCouchMigration(new LocalStorageCouch(COUCH_STORAGE_KEY), couch);

// AccountManager — restored synchronously from localStorage at construction.
// Restoration uses `fromJSON(saved, true)` to suppress per-account
// deserialization errors (e.g. an extension account on a device without
// window.nostr) so the rest of the saved accounts still load.
export const accounts: AccountManager<AccountMetadata> = (g.__wavefuncNostr.accounts ??=
  (() => {
    const m = new AccountManager<AccountMetadata>();
    registerCommonAccountTypes(m);
    try {
      const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          m.fromJSON(parsed, true);
        }
      }
      const activeId = localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
      if (activeId) {
        const account = m.getAccount(activeId);
        if (account) m.setActive(account);
      }
    } catch (err) {
      console.error("Failed to restore accounts:", err);
    }
    return m;
  })());

// Persist accounts on change. Attached exactly once across HMR via the
// globalThis guard so we don't end up with duplicate listeners hammering
// localStorage on every save.
if (!g.__wavefuncNostr.accountListenersAttached) {
  g.__wavefuncNostr.accountListenersAttached = true;

  const manualSave = new Subject<void>();
  merge(manualSave, accounts.accounts$).subscribe(() => {
    try {
      localStorage.setItem(
        ACCOUNTS_STORAGE_KEY,
        JSON.stringify(accounts.toJSON(true))
      );
    } catch (err) {
      console.error("Failed to persist accounts:", err);
    }
  });

  accounts.active$.subscribe((account) => {
    relayPreferences.setAccount(account?.pubkey ?? null);
    if (account) localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, account.id);
    else localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
  });
}

/** Shared publication boundary for actions and React callers. */
export async function publishEvent(event: NostrEvent, relays?: string[]) {
  const active = accounts.active;
  if (!active || active.pubkey !== event.pubkey) throw new Error("The signing account is no longer active");
  const mailbox = eventStore.getReplaceable(10002, event.pubkey);
  const personal = relayPreferences.state$.value.relays;
  const outboxes = personal?.filter(r => r.write).map(r => r.url) ?? (mailbox ? getOutboxes(mailbox) : []);
  const inboxes = event.tags.filter(([name]) => name === "p").flatMap(([, pubkey]) => {
    const recipient = pubkey && eventStore.getReplaceable(10002, pubkey);
    return recipient ? getInboxes(recipient) : [];
  });
  const wallet = eventStore.getReplaceable(WALLET_KIND, event.pubkey);
  const walletEvent = [17375, 7375, 7376, 10019].includes(event.kind);
  const targets = relays ?? (walletEvent
    ? (wallet ? getWalletRelays(wallet) ?? getWalletRelayUrls() : getWalletRelayUrls())
    : selectPublishRelays(getRelayPolicy(), event, outboxes, inboxes));
  const responses = await publishAccepted(relayPool, targets, event, relayAuthentication(active.signer, active.pubkey));
  for (const response of responses) if (response.ok) eventStore.add(event, response.from);
  publishedEvents$.next(event);
  return responses;
}

function createActionRunner() {
  // Capture the signer: an in-flight action must never switch accounts halfway through.
  const runner = new ActionRunner(eventStore, accounts.active?.signer ?? accounts.signer, publishEvent);
  // v7 inserts optimistically by default. Our publication boundary inserts only
  // after acceptance, so failed comments, wallet tokens and deletes stay failed.
  runner.saveToStore = false;
  return runner;
}

export let actions: ActionRunner = (g.__wavefuncNostr.actions ??=
  createActionRunner());
actions.saveToStore = false;

/** Rebuild the action context when the active account changes. */
export function resetActionRunner(): ActionRunner {
  actions = createActionRunner();
  g.__wavefuncNostr!.actions = actions;
  return actions;
}

// ── Login helpers ────────────────────────────────────────────────────────────

export async function loginWithExtension() {
  const account = await ExtensionAccount.fromExtension<AccountMetadata>();
  const existing = accounts.getAccountForPubkey(account.pubkey);
  if (existing) {
    accounts.setActive(existing);
    return existing;
  }
  accounts.addAccount(account);
  accounts.setActive(account);
  return account;
}

export function loginWithPrivateKey(key: string | Uint8Array) {
  const account = PrivateKeyAccount.fromKey<AccountMetadata>(key);
  const existing = accounts.getAccountForPubkey(account.pubkey);
  if (existing) {
    accounts.setActive(existing);
    return existing;
  }
  accounts.addAccount(account);
  accounts.setActive(account);
  return account;
}

export async function loginWithBunker(uri: string) {
  const signer = await NostrConnectSigner.fromBunkerURI(uri, { pool: relayPool });
  const pubkey = await signer.getPublicKey();
  const existing = accounts.getAccountForPubkey(pubkey);
  if (existing) {
    void signer.close().catch(() => undefined);
    accounts.setActive(existing);
    return existing;
  }
  const account = new NostrConnectAccount<AccountMetadata>(pubkey, signer);
  accounts.addAccount(account);
  accounts.setActive(account);
  return account;
}

/**
 * Login with an *already-connected* NostrConnectSigner. Used by the QR scan
 * flow in Nip46LoginDialog: the user scans the app's nostrconnect:// URI with
 * their bunker, the signer's `waitForSigner()` resolves, and we wrap that
 * exact signer in an account so the established session (client key, remote
 * pubkey) is preserved across reloads — no re-prompt on the bunker side.
 */
export async function loginWithConnectSigner(signer: NostrConnectSigner) {
  if (!signer.remote) {
    throw new Error("NostrConnectSigner has no remote pubkey");
  }
  const pubkey = await signer.getPublicKey();
  const existing = accounts.getAccountForPubkey(pubkey);
  if (existing) {
    void signer.close().catch(() => undefined);
    accounts.setActive(existing);
    return existing;
  }
  const account = new NostrConnectAccount<AccountMetadata>(pubkey, signer);
  accounts.addAccount(account);
  accounts.setActive(account);
  return account;
}

export function logout() {
  const active = accounts.active;
  if (active) {
    accounts.removeAccount(active);
    if (active.signer instanceof NostrConnectSigner) void active.signer.close().catch(() => undefined);
  }
}
