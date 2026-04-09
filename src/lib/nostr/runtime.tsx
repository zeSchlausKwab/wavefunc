import { EventFactory, EventStore } from "applesauce-core";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { createEventLoaderForStore } from "applesauce-loaders/loaders";
import { RelayPool } from "applesauce-relay";
import type { PublishResponse } from "applesauce-relay/types";
import {
  ExtensionSigner,
  NostrConnectSigner,
  PrivateKeySigner,
  type ISigner,
} from "applesauce-signers";
import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { nip19 } from "nostr-tools";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

const SESSION_STORAGE_KEY = "wavefunc:nostr-session:v1";

export type WavefuncSession =
  | { type: "extension" }
  | { type: "private-key"; key: string }
  | { type: "nostr-connect"; bunker: string };

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

function readStoredSession(): WavefuncSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "extension") {
      return { type: "extension" };
    }

    if (parsed.type === "private-key" && typeof parsed.key === "string") {
      return { type: "private-key", key: parsed.key };
    }

    if (parsed.type === "nostr-connect" && typeof parsed.bunker === "string") {
      return { type: "nostr-connect", bunker: parsed.bunker };
    }
  } catch (error) {
    console.error("Failed to read stored Nostr session", error);
  }

  return null;
}

function writeStoredSession(session: WavefuncSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function encodePrivateKey(signer: PrivateKeySigner) {
  return nip19.nsecEncode(signer.key);
}

function buildBunkerUri(signer: NostrConnectSigner) {
  if (!signer.remote) {
    throw new Error("Remote signer pubkey is missing");
  }

  const params = new URLSearchParams();
  for (const relay of signer.relays) {
    params.append("relay", relay);
  }
  if (signer.secret) {
    params.set("secret", signer.secret);
  }

  return `bunker://${signer.remote}?${params.toString()}`;
}

export type WavefuncNostrContextValue = {
  eventStore: EventStore;
  relayPool: RelayPool;
  eventFactory: EventFactory;
  readRelays: string[];
  writeRelays: string[];
  signer: ISigner | null;
  currentPubkey: string | null;
  currentAccount: WavefuncAccount | null;
  session: WavefuncSession | null;
  sessionReady: boolean;
  setSigner: (signer: ISigner | null) => Promise<string | null>;
  clearSigner: () => void;
  authenticate: (
    signer: ISigner,
    session: WavefuncSession | null
  ) => Promise<WavefuncAccount>;
  loginWithExtension: () => Promise<WavefuncAccount>;
  loginWithPrivateKey: (key: string | Uint8Array) => Promise<WavefuncAccount>;
  loginWithBunker: (bunker: string) => Promise<WavefuncAccount>;
  logout: () => Promise<void>;
  connectExtensionSigner: () => Promise<string>;
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

  const relayPool = useMemo(() => {
    const pool = new RelayPool();

    for (const relay of unique([...readRelayList, ...writeRelayList])) {
      pool.relay(relay);
    }

    NostrConnectSigner.pool = pool;
    return pool;
  }, [readRelayList, writeRelayList]);

  const eventStore = useMemo(() => {
    const store = new EventStore();
    createEventLoaderForStore(store, relayPool, {
      lookupRelays: readRelayList,
      extraRelays: readRelayList,
    });
    return store;
  }, [readRelayList, relayPool]);

  const eventFactory = useMemo(() => new EventFactory(), []);
  const [signer, setSignerState] = useState<ISigner | null>(null);
  const [currentPubkey, setCurrentPubkey] = useState<string | null>(null);
  const [currentAccount, setCurrentAccount] = useState<WavefuncAccount | null>(
    null
  );
  const [session, setSession] = useState<WavefuncSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const signerRef = useRef<ISigner | null>(null);

  const closeSigner = useCallback(async (target: ISigner | null) => {
    if (!target || !("close" in target) || typeof target.close !== "function") {
      return;
    }

    await Promise.race([
      target.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
  }, []);

  const clearSigner = useCallback(() => {
    signerRef.current = null;
    setSignerState(null);
    setCurrentPubkey(null);
    setCurrentAccount(null);
    setSession(null);
    eventFactory.clearSigner();
    writeStoredSession(null);
  }, [eventFactory]);

  const setSigner = useCallback(
    async (nextSigner: ISigner | null) => {
      if (!nextSigner) {
        clearSigner();
        return null;
      }

      eventFactory.setSigner(nextSigner);
      const pubkey = await nextSigner.getPublicKey();
      signerRef.current = nextSigner;
      setSignerState(nextSigner);
      setCurrentPubkey(pubkey);
      setCurrentAccount(accountFromPubkey(pubkey));
      return pubkey;
    },
    [clearSigner, eventFactory]
  );

  const authenticate = useCallback(
    async (nextSigner: ISigner, nextSession: WavefuncSession | null) => {
      const previousSigner = signerRef.current;
      if (previousSigner && previousSigner !== nextSigner) {
        await closeSigner(previousSigner);
      }

      const pubkey = await setSigner(nextSigner);
      if (!pubkey) {
        throw new Error("Failed to resolve signer pubkey");
      }

      const account = accountFromPubkey(pubkey);
      setSession(nextSession);
      writeStoredSession(nextSession);
      return account;
    },
    [closeSigner, setSigner]
  );

  const connectExtensionSigner = useCallback(async () => {
    const pubkey = await setSigner(new ExtensionSigner());
    if (!pubkey) {
      throw new Error("Failed to connect extension signer");
    }

    return pubkey;
  }, [setSigner]);

  const loginWithExtension = useCallback(
    async () => authenticate(new ExtensionSigner(), { type: "extension" }),
    [authenticate]
  );

  const loginWithPrivateKey = useCallback(
    async (key: string | Uint8Array) => {
      const nextSigner = PrivateKeySigner.fromKey(key);
      return authenticate(nextSigner, {
        type: "private-key",
        key: encodePrivateKey(nextSigner),
      });
    },
    [authenticate]
  );

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
    [relayPool, writeRelayList]
  );

  const loginWithBunker = useCallback(
    async (bunker: string) => {
      const nextSigner = await NostrConnectSigner.fromBunkerURI(bunker);
      return authenticate(nextSigner, { type: "nostr-connect", bunker });
    },
    [authenticate]
  );

  const logout = useCallback(async () => {
    await closeSigner(signerRef.current);
    clearSigner();
  }, [clearSigner, closeSigner]);

  const publishEvent = useCallback(
    async (event: NostrEvent, relays?: string[]) => {
      const targetRelays = unique(relays ?? writeRelayList);

      if (targetRelays.length === 0) {
        throw new Error("No write relays configured");
      }

      const responses = await relayPool.publish(targetRelays, event);
      eventStore.add(event, targetRelays[0]!);

      return responses;
    },
    [eventStore, relayPool, writeRelayList]
  );

  const signAndPublish = useCallback(
    async (draft: EventTemplate, relays?: string[]) => {
      if (!signer) {
        throw new Error("No signer configured");
      }

      const event = await eventFactory.sign(draft);
      await publishEvent(event, relays);
      return event;
    },
    [eventFactory, publishEvent, signer]
  );

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      const stored = readStoredSession();

      if (!stored) {
        if (active) {
          setSessionReady(true);
        }
        return;
      }

      try {
        if (stored.type === "extension") {
          await authenticate(new ExtensionSigner(), stored);
        } else if (stored.type === "private-key") {
          await authenticate(PrivateKeySigner.fromKey(stored.key), stored);
        } else if (stored.type === "nostr-connect") {
          const restored = await NostrConnectSigner.fromBunkerURI(stored.bunker);
          await authenticate(restored, stored);
        }
      } catch (error) {
        console.error("Failed to restore Nostr session", error);
        clearSigner();
      } finally {
        if (active) {
          setSessionReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, [authenticate, clearSigner]);

  const value = useMemo<WavefuncNostrContextValue>(
    () => ({
      eventStore,
      relayPool,
      eventFactory,
      readRelays: readRelayList,
      writeRelays: writeRelayList,
      signer,
      currentPubkey,
      currentAccount,
      session,
      sessionReady,
      setSigner,
      clearSigner,
      authenticate,
      loginWithExtension,
      loginWithPrivateKey,
      loginWithBunker,
      logout,
      connectExtensionSigner,
      createNostrConnectSigner,
      publishEvent,
      signAndPublish,
    }),
    [
      authenticate,
      clearSigner,
      connectExtensionSigner,
      createNostrConnectSigner,
      currentAccount,
      currentPubkey,
      eventFactory,
      eventStore,
      loginWithBunker,
      loginWithExtension,
      loginWithPrivateKey,
      logout,
      publishEvent,
      readRelayList,
      relayPool,
      session,
      sessionReady,
      setSigner,
      signAndPublish,
      signer,
      writeRelayList,
    ]
  );

  return (
    <WavefuncNostrContext.Provider value={value}>
      {children}
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
