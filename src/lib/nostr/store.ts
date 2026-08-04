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
import { RelayPool } from "applesauce-relay";
import { storeEvents } from "applesauce-relay/operators";
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
  IndexedDBCouch,
  LocalStorageCouch,
  WALLET_KIND,
  getWalletRelays,
} from "applesauce-wallet/helpers";
import type { Couch } from "applesauce-wallet/helpers";
import { merge, Subject } from "rxjs";
import { getReadRelayUrls } from "../../config/nostr";
import { SOCIAL_EVENT_KINDS } from "./social";

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
  couch?: Couch;
  indexedDbCouch?: IndexedDBCouch;
  couchMigration?: Promise<void>;
  accounts?: AccountManager<AccountMetadata>;
  actions?: ActionRunner;
  accountListenersAttached?: boolean;
  publishRelaysRef?: { current: string[] };
  eventLoaderAttached?: boolean;
}
const g = globalThis as typeof globalThis & { __wavefuncNostr?: NostrGlobals };
g.__wavefuncNostr ??= {};

// EventStore
export const eventStore: EventStore = (g.__wavefuncNostr.eventStore ??=
  new EventStore());

// RelayPool — also wires NostrConnectSigner pool fallback so bunker signers
// can communicate without per-call configuration.
export const relayPool: RelayPool = (g.__wavefuncNostr.relayPool ??= (() => {
  const pool = new RelayPool();
  NostrConnectSigner.pool = pool;
  return pool;
})());

// Shared, batched social loaders. A loader instance buffers tag lookups from
// all visible station cards into a small number of relay requests instead of
// opening one subscription per card. Public relays are required here because
// the WaveFunc station mirror does not mirror every reaction/zap event.
const socialLoaderOptions = {
  bufferTime: 100,
  bufferSize: 200,
  extraRelays: getReadRelayUrls(),
  eventStore,
};

export const loadReactions = createReactionsLoader(
  relayPool,
  socialLoaderOptions,
);
export const loadLightningZaps = createZapsLoader(
  relayPool,
  socialLoaderOptions,
);
export const loadSocialByEvent = createTagValueLoader(relayPool, "e", {
  ...socialLoaderOptions,
  kinds: [...SOCIAL_EVENT_KINDS],
});
export const loadNutzapsByAddress = createTagValueLoader(relayPool, "a", {
  ...socialLoaderOptions,
  kinds: [9321],
});
export const loadCommentsByAddress = createTagValueLoader(relayPool, "A", {
  ...socialLoaderOptions,
  kinds: [1111],
});

// Cashu couch — IndexedDB is the v6 wallet's durable backup for in-flight
// operations. Migrate any stranded tokens from the previous localStorage
// couch before the NutWallet starts so an upgrade cannot orphan funds.
export const couch: IndexedDBCouch = (g.__wavefuncNostr.indexedDbCouch ??=
  new IndexedDBCouch("wavefunc-cashu", "operation-couch"));

export function migrateLegacyCouch(): Promise<void> {
  return (g.__wavefuncNostr!.couchMigration ??= (async () => {
    const legacy = new LocalStorageCouch(COUCH_STORAGE_KEY);
    const tokens = await legacy.getAll();
    if (tokens.length === 0) return;

    for (const token of tokens) await couch.store(token);
    await legacy.clear();
  })());
}

// Default fallback publish relays (used when wallet relays are unavailable).
// React layer pushes the user-configured write relays in via setPublishRelays.
const publishRelaysRef = (g.__wavefuncNostr.publishRelaysRef ??= { current: [] });
export function setPublishRelays(relays: string[]) {
  publishRelaysRef.current = Array.from(new Set(relays.filter(Boolean)));
}
export function getPublishRelaysSnapshot(): string[] {
  return publishRelaysRef.current;
}

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
    if (account) localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, account.id);
    else localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
  });
}

// ── ActionRunner ─────────────────────────────────────────────────────────────
//
// The publish callback determines where wallet actions broadcast their events.
// Priority order:
//   1. Caller-specified relays (passed by the action itself)
//   2. The wallet's own configured relays (from the kind 17375 wallet event)
//   3. The runtime's default publish relay list (set by the React provider)
//
// Optimistic add to the EventStore happens before the network publish so the
// UI updates immediately; we roll back if the publish throws.
function createActionRunner() {
  return new ActionRunner(eventStore, accounts.signer, async (event: NostrEvent, relays?: string[]) => {
    const pubkey = accounts.active?.pubkey;
    if (!pubkey) return;

    let targetRelays: string[];
    if (relays && relays.length > 0) {
      targetRelays = relays;
    } else {
      const wallet = eventStore.getReplaceable(WALLET_KIND, pubkey);
      const walletRelays = wallet ? getWalletRelays(wallet) : undefined;
      targetRelays = Array.from(
        new Set(
          [...(walletRelays ?? []), ...publishRelaysRef.current].filter(Boolean)
        )
      );
    }

    if (targetRelays.length === 0) return;

    eventStore.add(event, targetRelays[0]);
    try {
      await relayPool.publish(targetRelays, event);
    } catch (err) {
      eventStore.remove(event);
      throw err;
    }
  });
}

export let actions: ActionRunner = (g.__wavefuncNostr.actions ??=
  createActionRunner());

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
  if (active) accounts.removeAccount(active);
}

// Marks the event-loader as attached (called by the React provider exactly
// once). Tracked here so HMR doesn't double-attach.
export function markEventLoaderAttached(): boolean {
  if (g.__wavefuncNostr!.eventLoaderAttached) return false;
  g.__wavefuncNostr!.eventLoaderAttached = true;
  return true;
}
