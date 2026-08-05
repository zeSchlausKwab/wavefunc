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
import { getInboxes, getOutboxes } from "applesauce-core/helpers/mailboxes";
import type { PublishResponse } from "applesauce-relay/types";
import type { AccountManager } from "applesauce-accounts";
import type { ActionRunner } from "applesauce-actions";
import type { Couch } from "applesauce-wallet/helpers";
import { NutWallet } from "applesauce-wallet/wallet";
import { createUnifiedEventLoader } from "applesauce-loaders/loaders";
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
  eventCache,
  relayQueries,
  markEventLoaderAttached,
  loginWithExtension as storeLoginWithExtension,
  loginWithPrivateKey as storeLoginWithPrivateKey,
  loginWithBunker as storeLoginWithBunker,
  loginWithConnectSigner as storeLoginWithConnectSigner,
  logout as storeLogout,
  type AccountMetadata,
} from "./store";
import type { EventTemplate } from "./types";
import {
  getIdentityRelayUrls,
  getNostrCacheScope,
  getRelayPolicy,
  getWalletRelayUrls,
  getContactsRelayUrls,
} from "../../config/nostr";
import { selectPublishRelays } from "../../config/relayPolicy";

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

  // Warm only the authoritative app-data relay. Other roles connect lazily
  // when a profile, wallet, social read, or publish actually needs them.
  useEffect(() => {
    for (const url of readRelayList) {
      relayPool.relay(url);
    }
    setPublishRelays(writeRelayList);
  }, [readRelayList, writeRelayList]);

  // Attach the event loader exactly once across HMR. The loader resolves
  // address pointers / replaceable events lazily and needs an initial set of
  // lookup relays so it knows where to ask for events with no hint.
  useEffect(() => {
    if (!markEventLoaderAttached()) return;
    const cacheRequest = (filters: Parameters<typeof eventCache.query>[1]) =>
      eventCache.query(getNostrCacheScope(), filters);
    const createLoader = (relays: string[]) =>
      createUnifiedEventLoader(relayPool, {
        lookupRelays: relays,
        extraRelays: relays,
        cacheRequest,
        // Relay hints on arbitrary event IDs could cross the development
        // boundary. App content has an authoritative relay and other roles
        // are selected explicitly by kind below.
        followRelayHints: false,
      });
    const appLoader = createLoader(readRelayList);
    const identityLoader = createLoader(getIdentityRelayUrls());
    const walletLoader = createLoader(getWalletRelayUrls());
    const contactsLoader = createLoader(getContactsRelayUrls());

    const routedLoader: typeof appLoader = Object.assign(
      (pointer: Parameters<typeof appLoader>[0]) => {
        const kind = "kind" in pointer ? pointer.kind : undefined;
        if (kind === 0 || kind === 10002) return identityLoader(pointer);
        if (kind === 10019) return walletLoader(pointer);
        if (kind === 3) return contactsLoader(pointer);
        return appLoader(pointer);
      },
      {
        stop() {
          appLoader.stop();
          identityLoader.stop();
          walletLoader.stop();
          contactsLoader.stop();
        },
        [Symbol.dispose]() {
          this.stop();
        },
      },
    );
    eventStore.eventLoader = routedLoader;
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
      relays: getWalletRelayUrls(),
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

  // Keep the active author's NIP-65 mailbox metadata warm. Publishing reads
  // this synchronously, so route actions never wait for a relay round trip.
  useEffect(() => {
    if (!currentPubkey) return;
    const query = relayQueries.query({
      scope: getNostrCacheScope(),
      relays: getIdentityRelayUrls(),
      filters: [{ kinds: [10002], authors: [currentPubkey], limit: 1 }],
      live: false,
    });
    return query.subscribe(() => undefined);
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
      const relayListEvent = eventStore.getReplaceable(10002, event.pubkey);
      const authorOutboxes = relayListEvent ? getOutboxes(relayListEvent) : [];
      const recipientInboxes = event.tags
        .filter(([name, pubkey]) => name === "p" && Boolean(pubkey))
        .flatMap(([, pubkey]) => {
          const mailbox = eventStore.getReplaceable(10002, pubkey!);
          return mailbox ? getInboxes(mailbox) : [];
        });
      const targetRelays = unique(
        relays ??
          selectPublishRelays(
            getRelayPolicy(),
            event,
            authorOutboxes,
            recipientInboxes,
          ),
      );

      if (targetRelays.length === 0) {
        throw new Error("No write relays configured");
      }

      try {
        const responses = await relayPool.publish(targetRelays, event);
        if (!responses.some((response) => response.ok)) {
          const details = responses
            .map((response) => `${response.from}: ${response.message ?? "rejected"}`)
            .join("; ");
          throw new Error(details || "Every compatible relay rejected the event");
        }
        eventStore.add(
          event,
          responses.find((response) => response.ok)?.from ?? targetRelays[0],
        );
        return responses;
      } catch (error) {
        throw error;
      }
    },
    []
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
