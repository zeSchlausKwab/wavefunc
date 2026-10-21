import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { verifyEvent } from "nostr-tools/pure";
import { decode } from "light-bolt11-decoder";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const SUPPORT_PUBKEY =
  "3aa5817273c3b2f94f491840e0472f049d0f10009e23de63006166bca9b36ea3";
export const SUPPORT_NAMESPACE = "live.wavefunc.support";
export const SUPPORT_LABEL = "app-support";
// Fixed rollout cutoff: older direct-to-profile zaps may seed the board.
// Never compute this from the viewer's current time.
export const LEGACY_PROFILE_ZAP_CUTOFF = 1792573093; // 2026-10-21 08:58:13 UTC
export type SupportProvider = { pubkey: string; lnurl: string };
export type SupportReceipt = {
  event: NostrEvent;
  request: NostrEvent;
  sender: string | null;
  msats: bigint;
  paymentHash: string;
  marked: boolean;
};
const values = (event: NostrEvent, name: string) =>
  event.tags.filter((t) => t[0] === name).map((t) => t[1]);
const single = (event: NostrEvent, name: string) => {
  const tags = values(event, name);
  return tags.length === 1 ? tags[0] : undefined;
};
const hasLabel = (event: NostrEvent, label: string) =>
  event.tags.some((t) => t[0] === "L" && t[1] === SUPPORT_NAMESPACE) &&
  event.tags.some(
    (t) => t[0] === "l" && t[1] === label && t[2] === SUPPORT_NAMESPACE,
  );
export const supportLabels = (): string[][] => [
  ["L", SUPPORT_NAMESPACE],
  ["l", SUPPORT_LABEL, SUPPORT_NAMESPACE],
];

export function lightningEndpoint(address: string): string {
  const match = /^([^@\s/?#]+)@([^@\s/?#]+)$/.exec(address);
  if (!match) throw new Error("Invalid Lightning address");
  const url = new URL(
    `https://${match[2]}/.well-known/lnurlp/${encodeURIComponent(match[1]!)}`,
  );
  if (url.username || url.password || url.port)
    throw new Error("Invalid Lightning address");
  return url.href;
}
export function encodeLnurl(endpoint: string) {
  return bech32.encode(
    "lnurl",
    bech32.toWords(new TextEncoder().encode(endpoint)),
    2000,
  );
}

export function supportRequest(
  amountMsat: number,
  content: string,
  relays: string[],
  lnurl: string,
): EventTemplate {
  if (!Number.isSafeInteger(amountMsat) || amountMsat <= 0)
    throw new Error("Choose a positive whole-sat amount");
  return {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [
      ["relays", ...relays],
      ["amount", String(amountMsat)],
      ["p", SUPPORT_PUBKEY],
      ["lnurl", lnurl],
      ["client", "WaveFunc"],
      ...supportLabels(),
    ],
  };
}

/** NIP-57 trust is in the advertised LNURL receipt signer, not an arbitrary
 * event with a p tag. Bind its signed receipt to the signed request and invoice. */
export function verifySupportReceipt(
  event: NostrEvent,
  provider: SupportProvider,
): SupportReceipt | null {
  try {
    if (
      event.kind !== 9735 ||
      event.pubkey !== provider.pubkey ||
      !verifyEvent(event) ||
      single(event, "p") !== SUPPORT_PUBKEY
    )
      return null;
    const description = single(event, "description");
    const invoice = single(event, "bolt11");
    if (!description || !invoice || !/^lnbc/i.test(invoice)) return null;
    const request = JSON.parse(description) as NostrEvent;
    if (
      request.kind !== 9734 ||
      !verifyEvent(request) ||
      single(request, "p") !== SUPPORT_PUBKEY
    )
      return null;
    if (!request.tags.some((t) => t[0] === "relays" && t.length > 1))
      return null;
    for (const tag of ["e", "a"]) {
      if (
        values(request, tag).length > 1 ||
        values(event, tag).length > 1 ||
        single(request, tag) !== single(event, tag)
      )
        return null;
    }
    if (
      values(event, "P").length > 1 ||
      (single(event, "P") && single(event, "P") !== request.pubkey)
    )
      return null;
    if (
      values(request, "P").length > 1 ||
      (single(request, "P") && single(request, "P") !== provider.pubkey)
    )
      return null;
    if (
      values(request, "lnurl").length > 1 ||
      (single(request, "lnurl") &&
        single(request, "lnurl")!.toLowerCase() !==
          provider.lnurl.toLowerCase())
    )
      return null;
    const decoded = decode(invoice);
    const section = (name: string) => {
      const found = decoded.sections.find((s) => s.name === name);
      return found && "value" in found ? found.value : undefined;
    };
    const rawAmount = section("amount");
    if (typeof rawAmount !== "string" || !/^\d+$/.test(rawAmount)) return null;
    const msats = BigInt(rawAmount);
    if (msats <= 0n || msats > 2_100_000_000_000_000_000n) return null;
    const expectedHash = bytesToHex(
      sha256(new TextEncoder().encode(description)),
    );
    // NIP-57 makes description-hash binding a SHOULD. Some LNURL providers
    // issue plain-description invoices; their signed receipt remains the
    // attestation. If a hash is present it must match exactly.
    const descriptionHash = section("description_hash");
    if (descriptionHash !== undefined && descriptionHash !== expectedHash)
      return null;
    const paymentHash = section("payment_hash");
    if (typeof paymentHash !== "string" || !/^[0-9a-f]{64}$/.test(paymentHash))
      return null;
    if (values(request, "amount").length > 1) return null;
    const amount = single(request, "amount");
    if (
      amount !== undefined &&
      (!/^\d+$/.test(amount) || BigInt(amount) !== msats)
    )
      return null;
    const preimage = single(event, "preimage");
    if (
      preimage &&
      (!/^[0-9a-f]{64}$/i.test(preimage) ||
        bytesToHex(
          sha256(
            Uint8Array.from(preimage.match(/../g)!.map((v) => parseInt(v, 16))),
          ),
        ) !== paymentHash)
    )
      return null;
    return {
      event,
      request,
      msats,
      paymentHash,
      sender: request.tags.some((t) => t[0] === "anon") ? null : request.pubkey,
      marked: hasLabel(request, SUPPORT_LABEL),
    };
  } catch {
    return null;
  }
}

export function supportDecision(
  receiptId: string,
  include: boolean,
): EventTemplate {
  if (!/^[0-9a-f]{64}$/.test(receiptId)) throw new Error("Invalid receipt");
  return {
    kind: 1985,
    created_at: Math.floor(Date.now() / 1000),
    content: include
      ? "Confirmed WaveFunc app support"
      : "Excluded from WaveFunc app support",
    tags: [
      ["L", SUPPORT_NAMESPACE],
      ["l", include ? SUPPORT_LABEL : "exclude", SUPPORT_NAMESPACE],
      ["e", receiptId],
    ],
  };
}

export function supportLedger(
  receipts: SupportReceipt[],
  labels: NostrEvent[],
  authority = SUPPORT_PUBKEY,
) {
  const decisions = new Map<string, { include: boolean; event: NostrEvent }>();
  for (const event of labels) {
    if (
      event.kind !== 1985 ||
      event.pubkey !== authority ||
      !verifyEvent(event)
    )
      continue;
    const include = hasLabel(event, SUPPORT_LABEL);
    if (include === hasLabel(event, "exclude")) continue;
    for (const id of values(event, "e")) {
      if (!id) continue;
      const previous = decisions.get(id)?.event;
      if (
        !previous ||
        event.created_at > previous.created_at ||
        (event.created_at === previous.created_at && event.id < previous.id)
      )
        decisions.set(id, { include, event });
    }
  }
  const seen = new Set<string>();
  const totals = new Map<string, bigint>();
  const isLegacySupport = (receipt: SupportReceipt) =>
    receipt.event.created_at < LEGACY_PROFILE_ZAP_CUTOFF &&
    receipt.request.created_at < LEGACY_PROFILE_ZAP_CUTOFF &&
    !receipt.request.tags.some((t) => t[0] === "e" || t[0] === "a");
  const entries = [...receipts]
    .sort((a, b) => a.event.id.localeCompare(b.event.id))
    .map((receipt) => ({
      ...receipt,
      included:
        decisions.get(receipt.event.id)?.include ??
        (receipt.marked || isLegacySupport(receipt)),
      legacy: isLegacySupport(receipt),
      reviewed: decisions.has(receipt.event.id),
      decisionAt: decisions.get(receipt.event.id)?.event.created_at,
    }));
  // A provider may publish another receipt for the same invoice: count once.
  for (const receipt of entries) {
    if (!receipt.included || !receipt.sender || seen.has(receipt.paymentHash))
      continue;
    seen.add(receipt.paymentHash);
    totals.set(
      receipt.sender,
      (totals.get(receipt.sender) ?? 0n) + receipt.msats,
    );
  }
  const leaders = [...totals]
    .map(([pubkey, msats]) => ({ pubkey, msats }))
    .sort((a, b) =>
      a.msats === b.msats
        ? a.pubkey.localeCompare(b.pubkey)
        : a.msats > b.msats
          ? -1
          : 1,
    )
    .slice(0, 5);
  return { leaders, entries };
}

export function formatSupportSats(msats: bigint): string {
  const sats = msats / 1000n,
    fraction = (msats % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${sats.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
