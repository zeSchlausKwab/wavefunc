import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import {
  getAddressableReferences,
  getFirstTagValue,
  getMatchingTags,
  removeTags,
} from "./shared";

export const ADMIN_FEATURE_KIND = 30078;
const LABEL_PREFIX = "wavefunc:featured:";

export type AdminFeatureType = "lists" | "stations" | "users";
export type ParsedAdminFeature = ReturnType<typeof parseAdminFeatureEvent>;

export function getAdminFeatureLabel(type: AdminFeatureType): string {
  return `${LABEL_PREFIX}${type}`;
}

export function getAdminFeatureType(label?: string | null): AdminFeatureType | null {
  if (!label?.startsWith(LABEL_PREFIX)) {
    return null;
  }

  const value = label.slice(LABEL_PREFIX.length);
  return value === "lists" || value === "stations" || value === "users"
    ? value
    : null;
}

export function getAdminFeatureRefs(event: Pick<NostrEvent, "tags">) {
  return getMatchingTags(event, "a")
    .map((tag) => tag[1])
    .filter((address): address is string => Boolean(address));
}

export function parseAdminFeatureEvent(event: NostrEvent, relays?: string[]) {
  const featureType = getAdminFeatureType(getFirstTagValue(event, "l"));

  return {
    event,
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    featureId: getFirstTagValue(event, "d"),
    featureType,
    refs: getAdminFeatureRefs(event),
    ...getAddressableReferences(event, relays),
  };
}

export function buildAdminFeatureTemplate(input: {
  type: AdminFeatureType;
  featureId?: string;
  refs?: string[];
}): EventTemplate {
  return {
    kind: ADMIN_FEATURE_KIND,
    content: "",
    tags: [
      ["d", input.featureId ?? crypto.randomUUID()],
      ["l", getAdminFeatureLabel(input.type)],
      ...(input.refs ?? []).map((ref) => ["a", ref]),
    ],
  };
}

export function buildAdminFeatureAddRefTemplate(
  event: NostrEvent,
  address: string
): EventTemplate {
  if (getAdminFeatureRefs(event).includes(address)) {
    return {
      kind: event.kind,
      content: event.content,
      tags: event.tags.map((tag) => [...tag]),
    };
  }

  return {
    kind: event.kind,
    content: event.content,
    tags: [...event.tags.map((tag) => [...tag]), ["a", address]],
  };
}

export function buildAdminFeatureRemoveRefTemplate(
  event: NostrEvent,
  address: string
): EventTemplate {
  return {
    kind: event.kind,
    content: event.content,
    tags: removeTags(event.tags, "a", (tag) => tag[1] === address),
  };
}

export function buildAdminFeatureDeletionTemplate(
  event: NostrEvent,
  reason = "Deleted admin feature group"
): EventTemplate {
  const featureId = getFirstTagValue(event, "d");
  const tags: string[][] = [
    ["e", event.id],
    ["k", String(ADMIN_FEATURE_KIND)],
    ["p", event.pubkey],
  ];

  if (featureId) {
    tags.push(["a", `${ADMIN_FEATURE_KIND}:${event.pubkey}:${featureId}`]);
  }

  return {
    kind: 5,
    content: reason,
    tags,
  };
}
