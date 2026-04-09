/**
 * Wavefunc nostr React provider.
 *
 * Reads from the singletons in `./store` and exposes them via context for
 * components that prefer hook-based access. The provider also pushes the
 * env-derived read/write relay lists into the singleton pool, attaches the
 * applesauce event loader exactly once, and runs the wallet kinds bootstrap
 * subscription whenever the active account changes.
 */
import {
  EventStoreProvider,
  FactoryProvider,
} from "applesauce-react/providers";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import type { PublishResponse } from "applesauce-relay/types";
import type { AccountManager } from "applesauce-accounts";
import type { ActionRunner } from "applesauce-actions";
import type { LocalStorageCouch } from "applesauce-wallet/helpers";
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
  eventFactory,
  accounts as accountManager,
  actions as actionRunner,
  couch as walletCouch,
  setPublishRelays,
  subscribeToWalletKinds,
  subscribeAutoUnlockWallet,
  markEventLoaderAttached,
  loginWithExtension as storeLoginWithExtension,
  loginWithPrivateKey as storeLoginWithPrivateKey,
  loginWithBunker as storeLoginWithBunker,
  loginWithConnectSigner as storeLoginWithConnectSigner,
  logout as storeLogout,
  type AccountMetadata,
} from "./store";

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
  eventFactory: typeof eventFactory;
  accounts: AccountManager<AccountMetadata>;
  actions: ActionRunner;
  couch: LocalStorageCouch;
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
      setCurrentPubkey(a?.pubkey ?? null);
    });
    return () => sub.unsubscribe();
  }, []);

  const currentAccount = useMemo(
    () => (currentPubkey ? accountFromPubkey(currentPubkey) : null),
    [currentPubkey]
  );

  // Wallet bootstrap — load wallet kinds whenever the active account changes.
  useEffect(() => {
    if (!currentPubkey) return;
    const sub = subscribeToWalletKinds(currentPubkey, readRelayList);
    return () => sub.unsubscribe();
  }, [currentPubkey, readRelayList]);

  // Auto-unlock — decrypt the wallet/tokens/history as soon as they arrive
  // so the header balance pill renders the correct value on first paint
  // instead of "0 SATS" until the popover is opened.
  useEffect(() => {
    if (!currentPubkey) return;
    const sub = subscribeAutoUnlockWallet(currentPubkey);
    return () => sub.unsubscribe();
  }, [currentPubkey]);

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

      // factory.build() applies the common operations (created_at, strip
      // stamps, replaceable d-tag) that the bare sign() pipeline doesn't.
      const stamped = await eventFactory.build(draft);
      const event = await eventFactory.sign(stamped);
      await publishEvent(event, relays);
      return event;
    },
    [publishEvent]
  );

  const value = useMemo<WavefuncNostrContextValue>(
    () => ({
      eventStore,
      relayPool,
      eventFactory,
      accounts: accountManager,
      actions: actionRunner,
      couch: walletCouch,
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
      <EventStoreProvider eventStore={eventStore}>
        <FactoryProvider factory={eventFactory}>{children}</FactoryProvider>
      </EventStoreProvider>
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
