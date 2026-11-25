import type { EventSigner } from "applesauce-core/factories";
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Relay, RelayPool } from "applesauce-relay";
import type { PublishOptions, PublishResponse, RelayAuthOptions } from "applesauce-relay/types";

export function requireAcceptedPublish(responses: PublishResponse[]): PublishResponse[] {
  if (!responses.some((response) => response.ok)) {
    throw new Error(responses.map((response) =>
      `${response.from}: ${response.message ?? "rejected"}`,
    ).join("; ") || "No eligible relay accepted the event");
  }
  return responses;
}

export function relayAuthentication(signer?: EventSigner | null, pubkey?: string | null): RelayAuthOptions {
  if (!signer || !pubkey) return { waitForAuth: false };
  return {
    waitForAuth: pubkey,
    authTimeout: 30_000,
    onAuthRequired: async ({ relay }) => {
      const response = await relay.authenticate(signer);
      if (!response.ok) throw new Error(response.message || "Relay authentication rejected");
    },
  };
}

/** A policy view over shared sockets. NutWallet's single-relay sync path and
 * pool operations must authenticate as the same captured account. The view
 * never changes the underlying pool's defaults or another account's policy. */
export function withRelayAuthentication(pool: RelayPool, signer: EventSigner, pubkey: string): RelayPool {
  const auth = relayAuthentication(signer, pubkey);
  const relays = new Map<Relay, Relay>();
  const view = <T extends object>(target: T, overrides: Partial<T>): T => new Proxy(target, {
    get(object, key) {
      if (key in overrides) return Reflect.get(overrides, key);
      const value = Reflect.get(object, key, object);
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
  return view(pool, {
    relay: (url) => {
      const relay = pool.relay(url);
      let scoped = relays.get(relay);
      if (!scoped) {
        scoped = view(relay, {
          request: (filters, options) => relay.request(filters, { ...options, ...auth }),
          subscription: (filters, options) => relay.subscription(filters, { ...options, ...auth }),
          publish: async (event, options) => {
            const response = await relay.publish(event, { ...options, ...auth });
            requireAcceptedPublish([response]);
            return response;
          },
          count: (filters, id, options) => relay.count(filters, id, { ...options, ...auth }),
          sync: (store, filter, direction, options) => relay.sync(store, filter, direction, { ...options, ...auth }),
        });
        relays.set(relay, scoped);
      }
      return scoped;
    },
    request: (urls, filters, options) => pool.request(urls, filters, { ...options, ...auth }),
    subscription: (urls, filters, options) => pool.subscription(urls, filters, { ...options, ...auth }),
    publish: async (urls, event, options) => requireAcceptedPublish(await pool.publish(urls, event, { ...options, ...auth })),
    count: (urls, filters, id, options) => pool.count(urls, filters, id, { ...options, ...auth }),
    sync: (urls, store, filter, direction, options) => pool.sync(urls, store, filter, direction, { ...options, ...auth }),
  });
}

export async function publishAccepted(
  pool: Pick<RelayPool, "publish">,
  relays: string[],
  event: NostrEvent,
  auth: PublishOptions = { waitForAuth: false },
) {
  if (!relays.length) throw new Error("No write relays configured");
  return requireAcceptedPublish(await pool.publish(relays, event, auth));
}

/** Mirror the exact signed event after its write relay (or the nutzap recipient) confirms it. */
export async function publishWithMirrors(
  pool: Pick<RelayPool, "publish">, event: NostrEvent, writeRelays: string[],
  getTargets: () => string[] | Promise<string[]>, auth: RelayAuthOptions = { waitForAuth: false },
) {
  const options = { ...auth, timeout: 8_000, retries: false };
  const delivered = await publishAccepted(pool, writeRelays, event, options);
  const attempted = new Set(writeRelays.map(url => url.replace(/\/$/, "")));
  try {
    const mirrors = (await getTargets()).filter(url => !attempted.has(url.replace(/\/$/, "")));
    if (mirrors.length) return [...delivered, ...await pool.publish(mirrors, event, options)];
  } catch (error) {
    // An optional mirror must never turn an acknowledged post or payment into a retry.
    console.warn("Additional relay broadcast failed", error);
  }
  return delivered;
}
