import type { Filter } from "applesauce-core/helpers/filter";
import { config, getAppStage } from "./env";
import { createRelayPolicy } from "./relayPolicy";

export const DEV_ADMIN_PUBKEY =
  "86a82cab18b293f53cbaaae8cdcbee3f7ec427fdf9f9c933db77800bb5ef38a0";

export function dedupeRelayUrls(relays: readonly string[]) {
  return Array.from(new Set(relays.filter(Boolean)));
}

export function isDevelopmentEnvironment() {
  return getAppStage() === "development";
}

export function getRelayPolicy() {
  return createRelayPolicy({
    stage: getAppStage(),
    appRelay: config.relayUrl,
  });
}

export function getNostrCacheScope() {
  const policy = getRelayPolicy();
  return `${policy.stage}:${policy.appData[0]}`;
}

export function getAppDataRelayUrls() {
  return getRelayPolicy().appData;
}

export function getPublicContentRelayUrls() {
  return getRelayPolicy().generalRead;
}

export function getIdentityRelayUrls() {
  return getRelayPolicy().identityRead;
}

export function getWalletRelayUrls() {
  return getRelayPolicy().walletRead;
}

export function getSocialRelayUrls() {
  const policy = getRelayPolicy();
  return policy.stage === "development"
    ? policy.appData
    : dedupeRelayUrls([...policy.appData, ...policy.socialRead]);
}

export function getZapRelayUrls() {
  const policy = getRelayPolicy();
  return dedupeRelayUrls([...policy.appData, ...policy.generalRead]);
}

export function getContactsRelayUrls() {
  const policy = getRelayPolicy();
  return policy.stage === "development"
    ? policy.appData
    : policy.generalRead;
}

export function getReadRelayUrls() {
  // Default application reads are deliberately scoped to the Wavefunc data
  // relay. Profile, wallet, and social code opts into its compatible role.
  return getAppDataRelayUrls();
}

export function getWriteRelayUrls() {
  const policy = getRelayPolicy();
  return policy.stage === "development"
    ? policy.appData
    : policy.generalWriteFallback;
}

export function getAppDataSubscriptionOptions<T extends object = Record<string, never>>(
  extra?: T
) {
  return {
    relayUrls: getAppDataRelayUrls(),
    ...extra,
  };
}

export function addressesToParameterizedFilters(
  kind: number,
  addresses: string[],
  extra: Omit<Filter, "kinds" | "authors" | "#d"> = {}
): Filter[] {
  if (addresses.length === 0) {
    return [{ kinds: [kind], authors: [], limit: 0 }];
  }

  const authors = [
    ...new Set(
      addresses
        .map((addr) => addr.split(":")[1])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const dTags = [
    ...new Set(
      addresses
        .map((addr) => addr.split(":")[2])
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  return [
    {
      kinds: [kind],
      authors,
      "#d": dTags,
      ...extra,
    },
  ];
}
