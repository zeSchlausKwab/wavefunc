/**
 * Wavefunc nostr React provider.
 *
 * Reads from the singletons in `./store` and exposes them via context for
 * components that prefer hook-based access. The provider also warms the
 * configured app relays and owns the active account
 * wallet's start/stop lifecycle.
 */
import { EventStoreProvider } from "applesauce-react/providers";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { EventSigner } from "applesauce-core/factories";
import { use$ } from "applesauce-react/hooks";
import { relayPreferences } from "../../config/relayPreferences";
import { useListeningStatus } from "./hooks/useListeningStatus";
import { useActiveWallet } from "./useActiveWallet";
import type { PublishResponse } from "applesauce-relay/types";
import type { AccountManager } from "applesauce-accounts";
import type { ActionRunner } from "applesauce-actions";
import type { Couch } from "applesauce-wallet/helpers";
import type { WavefuncWallet } from "./wallet";
import { NostrConnectSigner } from "applesauce-signers";
import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { nip19 } from "nostr-tools";
import {
  eventStore,
  relayPool,
  accounts as accountManager,
  couch as walletCouch,
  resetActionRunner,
  relayQueries,
  publishEvent,
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
} from "../../config/nostr";


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
  wallet: WavefuncWallet | null;
  walletError: Error | null;
  restartWallet: () => void;
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
      connectSecret: string;
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
  const preferences = use$(relayPreferences.state$);
  const writeRelayList = useMemo(() => unique(preferences?.relays && getRelayPolicy().stage === "production"
    ? preferences.relays.filter(r => r.write).map(r => r.url) : writeRelays), [writeRelays, preferences]);

  // Warm only the authoritative app-data relay. Other roles connect lazily
  // when a profile, wallet, social read, or publish actually needs them.
  useEffect(() => {
    for (const url of readRelayList) {
      relayPool.relay(url);
    }
  }, [readRelayList]);

  const activeAccount = use$(accountManager.active$);
  const currentPubkey = activeAccount?.pubkey ?? null;
  useListeningStatus(activeAccount);
  const activeActions = useMemo(() => resetActionRunner(), [activeAccount]);

  const currentAccount = useMemo(
    () => (currentPubkey ? accountFromPubkey(currentPubkey) : null),
    [currentPubkey]
  );

  const { wallet, error: walletError, restart: restartWallet } = useActiveWallet(activeAccount);

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
        connectSecret: string;
        signer: ConstructorParameters<typeof NostrConnectSigner>[0]["signer"];
        onAuth: ConstructorParameters<typeof NostrConnectSigner>[0]["onAuth"];
      }> = {}
    ) =>
      new NostrConnectSigner({
        pool: relayPool,
        relays: options.relays ?? writeRelayList,
        remote: options.remote,
        pubkey: options.pubkey,
        connectSecret: options.connectSecret,
        timeout: 60_000,
        signer: options.signer,
        onAuth: options.onAuth,
      }),
    [writeRelayList]
  );

  const signAndPublish = useCallback(
    async (draft: EventTemplate, relays?: string[]) => {
      const account = accountManager.active;
      if (!account) {
        throw new Error("No account active");
      }

      const event = await account.signer.signEvent({
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
      actions: activeActions,
      couch: walletCouch,
      wallet,
      walletError,
      restartWallet,
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
      walletError,
      restartWallet,
      activeAccount,
      activeActions,
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
