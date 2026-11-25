import type { Filter } from "applesauce-core/helpers/filter";
import { parseReplaceableAddress } from "applesauce-core/helpers/pointers";
import { config, getAppStage } from "./env";
import { relayPreferences } from "./relayPreferences";
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
  const policy = createRelayPolicy({
    stage: getAppStage(),
    appRelay: config.relayUrl,
  });
  const personal = relayPreferences.state$.value.relays;
  if (personal && policy.stage === "production") {
    policy.generalRead = personal.filter(r => r.read).map(r => r.url);
    policy.socialRead = policy.generalRead;
    policy.generalWriteFallback = personal.filter(r => r.write).map(r => r.url);
  }
  return policy;
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
  const authors = new Set<string>();
  const identifiers = new Set<string>();
  for (const address of addresses) {
    const ref = parseReplaceableAddress(address);
    if (!ref || ref.kind !== kind) continue;
    authors.add(ref.pubkey);
    identifiers.add(ref.identifier ?? "");
  }
  if (!authors.size) return [{ kinds: [kind], authors: [], limit: 0 }];
  // Batch mixed-author lists in one relay filter. Callers resolve the response
  // against the exact coordinates rather than assuming every combination belongs.
  return [{ ...extra, kinds: [kind], authors: [...authors], "#d": [...identifiers] }];
}
