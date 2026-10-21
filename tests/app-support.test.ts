import { describe, expect, test } from "bun:test";
import { finalizeEvent, getPublicKey, type NostrEvent } from "nostr-tools/pure";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  SUPPORT_PUBKEY,
  LEGACY_PROFILE_ZAP_CUTOFF,
  encodeLnurl,
  supportRequest,
  supportDecision,
  verifySupportReceipt,
  supportLedger,
  formatSupportSats,
} from "../src/lib/nostr/support";
import { loadSupportHistory } from "../src/lib/nostr/supportService";
const key = (n: number) => new Uint8Array(32).fill(n);
const provider = {
  pubkey: getPublicKey(key(1)),
  lnurl: encodeLnurl("https://wallet.example/.well-known/lnurlp/support"),
};
function invoice(
  description: string,
  amount = 1000,
  payment = "1".repeat(64),
  bound = true,
) {
  const field = (type: number, hex: string) => {
    const words = bech32.toWords(
      Uint8Array.from(hex.match(/../g)!.map((v) => parseInt(v, 16))),
    );
    return [type, words.length >> 5, words.length & 31, ...words];
  };
  return bech32.encode(
    `lnbc${amount * 10}p`,
    [
      ...Array(7).fill(0),
      ...field(1, payment),
      ...field(
        bound ? 23 : 13,
        bound
          ? bytesToHex(sha256(new TextEncoder().encode(description)))
          : bytesToHex(new TextEncoder().encode("Support invoice")),
      ),
      ...Array(104).fill(0),
    ],
    5000,
  );
}
function receipt(
  options: {
    marked?: boolean;
    sender?: number;
    amount?: number;
    payment?: string;
    anonymous?: boolean;
    created_at?: number;
    bound?: boolean;
    post?: boolean;
  } = {},
) {
  const request = supportRequest(
    options.amount ?? 1000,
    "support fixture",
    ["wss://relay.example"],
    provider.lnurl,
  );
  if (options.marked === false)
    request.tags = request.tags.filter((t) => !["L", "l"].includes(t[0]!));
  if (options.anonymous) request.tags.push(["anon"]);
  if (options.post) request.tags.push(["e", "a".repeat(64)]);
  const signed = finalizeEvent(
    { ...request, created_at: 1 },
    key(options.sender ?? 2),
  );
  const description = JSON.stringify(signed);
  return finalizeEvent(
    {
      kind: 9735,
      created_at: options.created_at ?? LEGACY_PROFILE_ZAP_CUTOFF + 2,
      content: "",
      tags: [
        ...signed.tags.filter((t) => t[0] === "e"),
        ["p", SUPPORT_PUBKEY],
        ["P", signed.pubkey],
        ["description", description],
        [
          "bolt11",
          invoice(description, options.amount, options.payment, options.bound),
        ],
      ],
    },
    key(1),
  );
}
const resign = (event: NostrEvent, tags: string[][], signer = 1) =>
  finalizeEvent(
    {
      kind: event.kind,
      content: event.content,
      created_at: event.created_at,
      tags,
    },
    key(signer),
  );

describe("app-support receipts", () => {
  test("new requests carry standard labels and verified receipts aggregate once per invoice", () => {
    const first = receipt({ amount: 5000 });
    const duplicate = receipt({ amount: 5000, created_at: 3 });
    const next = receipt({ amount: 3000, payment: "2".repeat(64) });
    const valid = [first, duplicate, next].map(
      (event) => verifySupportReceipt(event, provider)!,
    );
    expect(valid.every(Boolean)).toBe(true);
    expect(supportLedger(valid, []).leaders).toEqual([
      { pubkey: getPublicKey(key(2)), msats: 8000n },
    ]);
  });
  test("unmarked history requires a receiving-account decision; other authors cannot curate", () => {
    const parsed = verifySupportReceipt(receipt({ marked: false }), provider)!;
    const labels = finalizeEvent(
      { ...supportDecision(parsed.event.id, true), created_at: 4 },
      key(3),
    );
    expect(supportLedger([parsed], []).leaders).toEqual([]);
    expect(supportLedger([parsed], [labels]).leaders).toEqual([]);
    const authority = getPublicKey(key(3));
    expect(supportLedger([parsed], [labels], authority).leaders).toHaveLength(
      1,
    );
    const excluded = finalizeEvent(
      { ...supportDecision(parsed.event.id, false), created_at: 5 },
      key(3),
    );
    expect(
      supportLedger([parsed], [labels, excluded], authority).leaders,
    ).toEqual([]);
  });
  test("rejects forged provider, mismatched sender, amount, recipient, and invoice binding", () => {
    const event = receipt();
    expect(
      verifySupportReceipt(resign(event, event.tags, 4), provider),
    ).toBeNull();
    for (const [name, value] of [
      ["p", "a".repeat(64)],
      ["P", "b".repeat(64)],
      ["bolt11", invoice("unrelated")],
    ]) {
      expect(
        verifySupportReceipt(
          resign(
            event,
            event.tags.map((tag) => (tag[0] === name ? [name!, value!] : tag)),
          ),
          provider,
        ),
      ).toBeNull();
    }
    const description = event.tags.find((t) => t[0] === "description")![1]!;
    expect(
      verifySupportReceipt(
        resign(
          event,
          event.tags.map((tag) =>
            tag[0] === "bolt11" ? ["bolt11", invoice(description, 2000)] : tag,
          ),
        ),
        provider,
      ),
    ).toBeNull();
    expect(
      verifySupportReceipt(
        { ...JSON.parse(JSON.stringify(event)), sig: "0".repeat(128) },
        provider,
      ),
    ).toBeNull();
    expect(
      verifySupportReceipt(event, {
        ...provider,
        lnurl: encodeLnurl("https://other.example/pay"),
      }),
    ).toBeNull();
  });
  test("keeps anonymous zaps unranked and returns exactly the five highest identified totals", () => {
    const events = Array.from({ length: 7 }, (_, i) =>
      receipt({
        sender: i + 2,
        amount: (i + 1) * 1000,
        payment: String(i + 1).repeat(64),
      }),
    );
    events.push(
      receipt({
        sender: 10,
        amount: 1000000,
        payment: "f".repeat(64),
        anonymous: true,
      }),
    );
    const { leaders } = supportLedger(
      events.map((e) => verifySupportReceipt(e, provider)!),
      [],
    );
    expect(leaders).toHaveLength(5);
    expect(leaders.map((l) => l.msats)).toEqual([
      7000n,
      6000n,
      5000n,
      4000n,
      3000n,
    ]);
    expect(formatSupportSats(5000123n)).toBe("5,000.123");
  });
  test("accepts provider-attested legacy plain-description invoices without automatically classifying support", () => {
    const parsed = verifySupportReceipt(
      receipt({ bound: false, marked: false }),
      provider,
    );
    expect(parsed).not.toBeNull();
    expect(supportLedger([parsed!], []).leaders).toEqual([]);
  });
  test("only direct profile zaps before the fixed cutoff seed the board", () => {
    const old = verifySupportReceipt(
      receipt({ marked: false, created_at: LEGACY_PROFILE_ZAP_CUTOFF - 1 }),
      provider,
    )!;
    const post = verifySupportReceipt(
      receipt({
        marked: false,
        post: true,
        created_at: LEGACY_PROFILE_ZAP_CUTOFF - 1,
      }),
      provider,
    )!;
    const recent = verifySupportReceipt(
      receipt({ marked: false, created_at: LEGACY_PROFILE_ZAP_CUTOFF }),
      provider,
    )!;
    expect(supportLedger([old], []).leaders).toHaveLength(1);
    expect(supportLedger([post, recent], []).leaders).toEqual([]);
  });
  test("an unpaid request is never a receipt", () => {
    const event = receipt();
    const request = JSON.parse(
      event.tags.find((t) => t[0] === "description")![1]!,
    );
    expect(verifySupportReceipt(request, provider)).toBeNull();
  });
  test("history pagination retains receipts sharing a timestamp", async () => {
    const source = Array.from(
      { length: 450 },
      (_, i) =>
        ({ id: String(i), created_at: i < 425 ? 100 : 99 }) as NostrEvent,
    );
    const loaded = new Set<string>();
    const complete = await loadSupportHistory(
      async (filter) =>
        source
          .filter((e) => e.created_at <= filter.until!)
          .slice(0, filter.limit),
      {},
      new AbortController().signal,
      (events) => events.forEach((e) => loaded.add(e.id)),
      101,
    );
    expect(complete).toBe(true);
    expect(loaded.size).toBe(450);
  });
});
