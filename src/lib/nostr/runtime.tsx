import { EventFactory, EventStore } from "applesauce-core";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { createEventLoaderForStore } from "applesauce-loaders/loaders";
import { RelayPool } from "applesauce-relay";
import type { PublishResponse } from "applesauce-relay/types";
import {
  ExtensionSigner,
  NostrConnectSigner,
  type ISigner,
} from "applesauce-signers";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export type WavefuncNostrContextValue = {
  eventStore: EventStore;
  relayPool: RelayPool;
  eventFactory: EventFactory;
  readRelays: string[];
  writeRelays: string[];
  signer: ISigner | null;
  currentPubkey: string | null;
  setSigner: (signer: ISigner | null) => Promise<string | null>;
  clearSigner: () => void;
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

  const clearSigner = useCallback(() => {
    setSignerState(null);
    setCurrentPubkey(null);
    eventFactory.clearSigner();
  }, [eventFactory]);

  const setSigner = useCallback(
    async (nextSigner: ISigner | null) => {
      if (!nextSigner) {
        clearSigner();
        return null;
      }

      eventFactory.setSigner(nextSigner);
      const pubkey = await nextSigner.getPublicKey();
      setSignerState(nextSigner);
      setCurrentPubkey(pubkey);
      return pubkey;
    },
    [clearSigner, eventFactory]
  );

  const connectExtensionSigner = useCallback(async () => {
    const pubkey = await setSigner(new ExtensionSigner());
    if (!pubkey) {
      throw new Error("Failed to connect extension signer");
    }

    return pubkey;
  }, [setSigner]);

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

  const value = useMemo<WavefuncNostrContextValue>(
    () => ({
      eventStore,
      relayPool,
      eventFactory,
      readRelays: readRelayList,
      writeRelays: writeRelayList,
      signer,
      currentPubkey,
      setSigner,
      clearSigner,
      connectExtensionSigner,
      createNostrConnectSigner,
      publishEvent,
      signAndPublish,
    }),
    [
      clearSigner,
      connectExtensionSigner,
      createNostrConnectSigner,
      currentPubkey,
      eventFactory,
      eventStore,
      publishEvent,
      readRelayList,
      relayPool,
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
