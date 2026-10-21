import { describe, expect, test } from "bun:test";
import type { RelayPool } from "applesauce-relay";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { PrivateKeySigner } from "applesauce-signers";
import { unlockWalletRequest, getWalletRequestEncryption } from "applesauce-wallet-connect/helpers";
import { WalletResponseFactory } from "applesauce-wallet-connect/factories";
import { Observable, Subject } from "rxjs";
import { nwcPayInvoice, parseNWCConnectionString } from "../src/lib/nostr/nwc";

const secret = "2".repeat(64);
const service = PrivateKeySigner.fromKey("3".repeat(64));

async function fakeWallet(encryption: "nip04" | "nip44_v2", mode: "success" | "reject" | "silent" | "wrong-author" = "success") {
  let active = 0;
  const requests: NostrEvent[] = [];
  const responses = new Subject<NostrEvent>();
  const pubkey = await service.getPublicKey();
  const info = await service.signEvent({ kind: 13194, content: "pay_invoice get_info", tags: encryption === "nip04" ? [] : [["encryption", encryption]], created_at: 1 });
  const pool = {
    subscription: () => new Observable<NostrEvent>(subscriber => {
      active++;
      const sub = responses.subscribe(subscriber);
      queueMicrotask(() => subscriber.next(info));
      return () => { active--; sub.unsubscribe(); };
    }),
    publish: async (_relays: string[], event: NostrEvent) => {
      requests.push(event);
      if (mode === "reject") return [{ ok: false, from: "wss://wallet.example", message: "blocked: no write access" }];
      if (mode === "silent") return [{ ok: true, from: "wss://wallet.example" }];
      const request = await unlockWalletRequest(event, service);
      expect(request?.method).toBe("pay_invoice");
      expect(getWalletRequestEncryption(event)).toBe(encryption);
      const responder = mode === "wrong-author" ? PrivateKeySigner.fromKey("4".repeat(64)) : service;
      const response = await WalletResponseFactory.create(event, { result_type: "pay_invoice", result: { preimage: "paid" }, error: null }).as(responder).sign();
      queueMicrotask(() => responses.next(response));
      return [{ ok: true, from: "wss://wallet.example" }];
    },
  } as unknown as RelayPool;
  const connection = parseNWCConnectionString(`nostr+walletconnect://${pubkey}?relay=wss%3A%2F%2Fwallet.example&secret=${secret}`);
  return { pool, connection, requests, active: () => active };
}

describe("NWC v7 adapter", () => {
  for (const encryption of ["nip04", "nip44_v2"] as const) {
    test(`pays through negotiated ${encryption} and closes its subscription`, async () => {
      const fixture = await fakeWallet(encryption);
      expect(await nwcPayInvoice(fixture.connection, "lnbc-test", fixture.pool, { timeoutMs: 1000 })).toEqual({ preimage: "paid" });
      expect(fixture.requests.length).toBe(1);
      expect(fixture.active()).toBe(0);
    });
  }
  test("reports relay rejection and releases transport", async () => {
    const fixture = await fakeWallet("nip04", "reject");
    await expect(nwcPayInvoice(fixture.connection, "invoice", fixture.pool, { timeoutMs: 500 })).rejects.toThrow("no write access");
    expect(fixture.active()).toBe(0);
  });
  for (const mode of ["silent", "wrong-author"] as const) {
    test(`${mode} cannot become a successful payment`, async () => {
      const fixture = await fakeWallet("nip44_v2", mode);
      await expect(nwcPayInvoice(fixture.connection, "invoice", fixture.pool, { timeoutMs: 75 })).rejects.toThrow("timed out");
      expect(fixture.active()).toBe(0);
    });
  }
  test("rejects malformed connection keys and non-WebSocket relay URLs", () => {
    expect(() => parseNWCConnectionString("https://example.com")).toThrow();
    expect(() => parseNWCConnectionString(`nostr+walletconnect://bad?relay=wss://relay&secret=${secret}`)).toThrow();
    expect(() => parseNWCConnectionString(`nostr+walletconnect://${"a".repeat(64)}?relay=https://relay&secret=${secret}`)).toThrow();
  });
});
