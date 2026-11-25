import type { NostrEvent } from "applesauce-core/helpers/event";

export type AppStage = "development" | "production";

export type RelayConsumer = "client" | "co-located-service";

export type RelayPolicy = {
  stage: AppStage;
  appData: string[];
  generalRead: string[];
  generalWriteFallback: string[];
  identityRead: string[];
  walletRead: string[];
  socialRead: string[];
};

const GENERAL_RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.net",
] as const;

const IDENTITY_RELAYS = ["wss://purplepag.es", "wss://relay.nostr.band"] as const;
const WALLET_RELAYS = [
  "wss://relay.minibits.cash",
  "wss://relay.coinos.io",
] as const;

const APP_DATA_KINDS = new Set([31237, 31238, 31239, 31240, 31337]);
// Public social events emitted by WaveFunc, including opt-in NIP-38 statuses.
const SOCIAL_KINDS = new Set([0, 1, 3, 7, 1111, 1985, 9321, 10002, 30315]);

function unique(relays: readonly string[]): string[] {
  return Array.from(new Set(relays.map(normalizeRelayUrl).filter(Boolean)));
}

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function isLocalRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const octets = hostname.split(".").map(Number);
    const privateIpv4 =
      octets.length === 4 &&
      octets.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 255,
      ) &&
      (octets[0] === 10 ||
        octets[0] === 127 ||
        (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 169 && octets[1] === 254));
    return (
      parsed.protocol === "ws:" &&
      (hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "::1" ||
        hostname === "[::1]" ||
        privateIpv4)
    );
  } catch {
    return false;
  }
}

export function validateAppDataRelay(input: {
  stage: AppStage;
  appRelay: string;
  consumer?: RelayConsumer;
}): string {
  const appRelay = normalizeRelayUrl(input.appRelay);
  if (!appRelay) throw new Error("An app-data relay is required");

  const local = isLocalRelayUrl(appRelay);
  const consumer = input.consumer ?? "client";
  if (input.stage === "production" && local && consumer !== "co-located-service") {
    throw new Error("Production cannot use a local app-data relay");
  }
  if (input.stage === "development" && !local) {
    throw new Error("Development app data must stay on a local relay");
  }

  return appRelay;
}

export function createRelayPolicy(input: {
  stage: AppStage;
  appRelay: string;
}): RelayPolicy {
  const appRelay = validateAppDataRelay(input);

  const generalRead = unique(GENERAL_RELAYS);
  const identityRead = unique([...IDENTITY_RELAYS, ...GENERAL_RELAYS]);
  const walletRead = unique([...WALLET_RELAYS, ...GENERAL_RELAYS]);

  return {
    stage: input.stage,
    appData: [appRelay],
    generalRead,
    generalWriteFallback: unique(GENERAL_RELAYS),
    identityRead,
    walletRead,
    socialRead: unique(GENERAL_RELAYS),
  };
}

function isWavefuncList(event: NostrEvent): boolean {
  if (event.kind !== 30078) return false;
  return event.tags.some(
    ([name, value]) =>
      name === "l" &&
      Boolean(
        value &&
          (value.startsWith("wavefunc_") || value.startsWith("wavefunc:")),
      ),
  );
}

export function isPublicSocialEvent(event: Pick<NostrEvent, "kind">): boolean {
  return SOCIAL_KINDS.has(event.kind);
}

export function socialPublishRelays(
  policy: RelayPolicy,
  kind: number,
  authorOutboxes: readonly string[],
  recipientInboxes: readonly string[],
  hints: readonly string[] = [],
) {
  if (policy.stage === "development") return { targets: policy.appData, writeRelays: policy.appData };
  const writeRelays = unique([
    ...authorOutboxes, ...policy.generalWriteFallback,
  ]);
  return {
    writeRelays,
    targets: unique([
      ...writeRelays, ...recipientInboxes, ...policy.appData, ...hints,
      ...(kind === 0 || kind === 10002 ? IDENTITY_RELAYS : []),
    ]),
  };
}

/**
 * Select compatible publish relays for an already-signed event.
 *
 * Specialist relays are intentionally absent from the fallback. Identity
 * specialists receive only compatible profile/relay-list events, while wallet
 * specialists are left to Applesauce Wallet and kind-specific wallet loaders.
 */
export function selectPublishRelays(
  policy: RelayPolicy,
  event: NostrEvent,
  authorOutboxes: readonly string[] = [],
  recipientInboxes: readonly string[] = [],
): string[] {
  if (policy.stage === "development") return [...policy.appData];

  if (isPublicSocialEvent(event)) return socialPublishRelays(policy, event.kind, authorOutboxes, recipientInboxes).targets;

  if (APP_DATA_KINDS.has(event.kind) || isWavefuncList(event)) {
    return [...policy.appData];
  }

  const compatibleOutboxes = unique(authorOutboxes).slice(0, 8);
  const compatibleInboxes = unique(recipientInboxes).slice(0, 8);
  const authorTargets =
    compatibleOutboxes.length > 0
      ? compatibleOutboxes
      : policy.generalWriteFallback;

  return unique([...authorTargets, ...compatibleInboxes]);
}
