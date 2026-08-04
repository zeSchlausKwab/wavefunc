/**
 * Wavefunc nostr React provider.
 *
 * Reads from the singletons in `./store` and exposes them via context for
 * components that prefer hook-based access. The provider also pushes the
 * env-derived read/write relay lists into the singleton pool, attaches the
 * Applesauce event loader exactly once, and owns the active account wallet's
 * start/stop lifecycle.
 */
import { EventStoreProvider } from "applesauce-react/providers";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { EventSigner } from "applesauce-core/factories";
import type { PublishResponse } from "applesauce-relay/types";
import type { AccountManager } from "applesauce-accounts";
import type { ActionRunner } from "applesauce-actions";
import type { Couch } from "applesauce-wallet/helpers";
import { NutWallet } from "applesauce-wallet/wallet";
import { createEventLoaderForStore } from "applesauce-loaders/loaders";
import { NostrConnectSigner } from "applesauce-signers";
import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { nip19 } from "nostr-tools";
import {
  eventStore,
  relayPool,
  accounts as accountManager,
  actions as actionRunner,
  couch as walletCouch,
  migrateLegacyCouch,
  resetActionRunner,
  setPublishRelays,
  markEventLoaderAttached,
  loginWithExtension as storeLoginWithExtension,
  loginWithPrivateKey as storeLoginWithPrivateKey,
  loginWithBunker as storeLoginWithBunker,
  loginWithConnectSigner as storeLoginWithConnectSigner,
  logout as storeLogout,
  type AccountMetadata,
} from "./store";
import type { EventTemplate } from "./types";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export type WavefuncAccount = {
  pubkey: string;
  npub: string;
};

function accountFromPubkey(pubkey: string): WavefuncAccount {
  return {
    pubkey,
    npub: nip19.npubEncode(pubkey),
  };
}

export type WavefuncNostrContextValue = {
  eventStore: typeof eventStore;
  relayPool: typeof relayPool;
  signer: EventSigner | null;
  accounts: AccountManager<AccountMetadata>;
  actions: ActionRunner;
  couch: Couch;
  wallet: NutWallet | null;
  readRelays: string[];
  writeRelays: string[];
  currentPubkey: string | null;
  currentAccount: WavefuncAccount | null;
  sessionReady: boolean;
  loginWithExtension: () => Promise<WavefuncAccount>;
  loginWithPrivateKey: (key: string | Uint8Array) => Promise<WavefuncAccount>;
  loginWithBunker: (bunker: string) => Promise<WavefuncAccount>;
  loginWithConnectSigner: (
    signer: NostrConnectSigner
  ) => Promise<WavefuncAccount>;
  logout: () => Promise<void>;
  createNostrConnectSigner: (
    options?: Partial<{
      relays: string[];
      remote: string;
      pubkey: string;
      secret: string;
      signer: ConstructorParameters<typeof NostrConnectSigner>[0]["signer"];
      onAuth: ConstructorParameters<typeof NostrConnectSigner>[0]["onAuth"];
    }>
  ) => NostrConnectSigner;
  publishEvent: (
    event: NostrEvent,
    relays?: string[]
  ) => Promise<PublishResponse[]>;
  signAndPublish: (
    draft: EventTemplate,
    relays?: string[]
  ) => Promise<NostrEvent>;
};

const WavefuncNostrContext = createContext<WavefuncNostrContextValue | null>(
  null
);

type WavefuncNostrProviderProps = {
  children: ReactNode;
  readRelays: string[];
  writeRelays: string[];
};

export function WavefuncNostrProvider({
  children,
  readRelays,
  writeRelays,
}: WavefuncNostrProviderProps) {
  const readRelayList = useMemo(() => unique(readRelays), [readRelays]);
  const writeRelayList = useMemo(() => unique(writeRelays), [writeRelays]);

  // Push the configured relays into the singleton pool. Calling
  // `relayPool.relay(url)` is idempotent — it warm-connects each relay
  // exactly once and is safe to re-run on prop changes.
  useEffect(() => {
    for (const url of unique([...readRelayList, ...writeRelayList])) {
      relayPool.relay(url);
    }
    setPublishRelays(writeRelayList);
  }, [readRelayList, writeRelayList]);

  // Attach the event loader exactly once across HMR. The loader resolves
  // address pointers / replaceable events lazily and needs an initial set of
  // lookup relays so it knows where to ask for events with no hint.
  useEffect(() => {
    if (!markEventLoaderAttached()) return;
    createEventLoaderForStore(eventStore, relayPool, {
      lookupRelays: readRelayList,
      extraRelays: readRelayList,
    });
    // readRelayList is intentionally captured at first-mount; the loader
    // doesn't pick up later changes. New relay URLs added later are still
    // reachable through `relayPool.relay()` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reactive currentPubkey from the AccountManager.
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(
    accountManager.active?.pubkey ?? null
  );
  useEffect(() => {
    const sub = accountManager.active$.subscribe((a) => {
      resetActionRunner();
      setCurrentPubkey(a?.pubkey ?? null);
    });
    return () => sub.unsubscribe();
  }, []);

  const currentAccount = useMemo(
    () => (currentPubkey ? accountFromPubkey(currentPubkey) : null),
    [currentPubkey]
  );

  // Applesauce v6 wallet lifecycle. NutWallet owns the initial request,
  // negentropy reconciliation, live subscription, automatic decryption, and
  // operation state. Recreate it only when the active signer changes and stop
  // it during cleanup so account switches never leak wallet subscriptions.
  const [wallet, setWallet] = useState<NutWallet | null>(null);
  useEffect(() => {
    const signer = accountManager.active?.signer;
    if (!currentPubkey || !signer) {
      setWallet(null);
      return;
    }

    const instance = new NutWallet({
      pubkey: currentPubkey,
      signer,
      pool: relayPool,
      eventStore,
      couch: walletCouch,
      relays: readRelayList,
      autoUnlock: true,
    });
    let cancelled = false;
    setWallet(instance);

    void (async () => {
      try {
        await migrateLegacyCouch();
        if (!cancelled) await instance.start();
      } catch (error) {
        console.error("Failed to start wallet:", error);
      }
    })();

    return () => {
      cancelled = true;
      instance.stop();
      setWallet((active) => (active === instance ? null : active));
    };
  }, [currentPubkey, readRelayList]);

  // ── Login wrappers (return WavefuncAccount instead of raw Account) ──────
  const loginWithExtension = useCallback(async () => {
    const account = await storeLoginWithExtension();
    return accountFromPubkey(account.pubkey);
  }, []);

  const loginWithPrivateKey = useCallback(
    async (key: string | Uint8Array) => {
      const account = storeLoginWithPrivateKey(key);
      return accountFromPubkey(account.pubkey);
    },
    []
  );

  const loginWithBunker = useCallback(async (bunker: string) => {
    const account = await storeLoginWithBunker(bunker);
    return accountFromPubkey(account.pubkey);
  }, []);

  const loginWithConnectSigner = useCallback(
    async (signer: NostrConnectSigner) => {
      const account = await storeLoginWithConnectSigner(signer);
      return accountFromPubkey(account.pubkey);
    },
    []
  );

  const logout = useCallback(async () => {
    storeLogout();
  }, []);

  const createNostrConnectSigner = useCallback(
    (
      options: Partial<{
        relays: string[];
        remote: string;
        pubkey: string;
        secret: string;
        signer: ConstructorParameters<typeof NostrConnectSigner>[0]["signer"];
        onAuth: ConstructorParameters<typeof NostrConnectSigner>[0]["onAuth"];
      }> = {}
    ) =>
      new NostrConnectSigner({
        pool: relayPool,
        relays: options.relays ?? writeRelayList,
        remote: options.remote,
        pubkey: options.pubkey,
        secret: options.secret,
        signer: options.signer,
        onAuth: options.onAuth,
      }),
    [writeRelayList]
  );

  const publishEvent = useCallback(
    async (event: NostrEvent, relays?: string[]) => {
      const targetRelays = unique(relays ?? writeRelayList);

      if (targetRelays.length === 0) {
        throw new Error("No write relays configured");
      }

      // Optimistic local update — add to store first so reactive subscribers
      // get an immediate signal. Roll back if the relay rejects the event.
      eventStore.add(event, targetRelays[0]!);

      try {
        return await relayPool.publish(targetRelays, event);
      } catch (error) {
        eventStore.remove(event);
        throw error;
      }
    },
    [writeRelayList]
  );

  const signAndPublish = useCallback(
    async (draft: EventTemplate, relays?: string[]) => {
      if (!accountManager.active) {
        throw new Error("No account active");
      }

      const event = await accountManager.signer.signEvent({
        ...draft,
        created_at: draft.created_at ?? Math.floor(Date.now() / 1000),
      });
      await publishEvent(event, relays);
      return event;
    },
    [publishEvent]
  );

  const value = useMemo<WavefuncNostrContextValue>(
    () => ({
      eventStore,
      relayPool,
      signer: accountManager.active?.signer ?? null,
      accounts: accountManager,
      actions: actionRunner,
      couch: walletCouch,
      wallet,
      readRelays: readRelayList,
      writeRelays: writeRelayList,
      currentPubkey,
      currentAccount,
      sessionReady: true,
      loginWithExtension,
      loginWithPrivateKey,
      loginWithBunker,
      loginWithConnectSigner,
      logout,
      createNostrConnectSigner,
      publishEvent,
      signAndPublish,
    }),
    [
      readRelayList,
      writeRelayList,
      wallet,
      currentPubkey,
      currentAccount,
      loginWithExtension,
      loginWithPrivateKey,
      loginWithBunker,
      loginWithConnectSigner,
      logout,
      createNostrConnectSigner,
      publishEvent,
      signAndPublish,
    ]
  );

  return (
    <WavefuncNostrContext.Provider value={value}>
      <EventStoreProvider eventStore={eventStore}>{children}</EventStoreProvider>
    </WavefuncNostrContext.Provider>
  );
}

export function useWavefuncNostr() {
  const context = useContext(WavefuncNostrContext);

  if (!context) {
    throw new Error("useWavefuncNostr must be used inside WavefuncNostrProvider");
  }

  return context;
}
