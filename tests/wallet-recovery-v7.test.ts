import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { EventStore } from "applesauce-core";
import { PrivateKeySigner } from "applesauce-signers";
import { WalletFactory, WalletTokenFactory } from "applesauce-wallet/factories";
import type { Couch } from "applesauce-wallet/helpers";
import type { RelayPool } from "applesauce-relay";
import { getEncodedToken, normalizeProofAmounts, type Token, type Wallet as CashuWallet, type MintQuoteBolt11Response } from "@cashu/cashu-ts";
import { of } from "rxjs";
import { WalletCouch, createCouchMigration } from "../src/lib/nostr/walletCouch";
import { WavefuncWallet } from "../src/lib/nostr/wallet";

const signer = PrivateKeySigner.fromKey("8".repeat(64));
const mint = "https://mint.example";
const token = (secret = "fixture-proof"): Token => ({ mint, unit: "sat", proofs: normalizeProofAmounts([
  { id: "009a1f293253e41e", amount: 8, secret, C: `02${"ab".repeat(32)}` },
]) });
const createCouch = (factory = new IDBFactory()) => new WalletCouch("fixture-wallet", "operation-couch", () => factory);
class FixtureWallet extends WavefuncWallet {
  get actionRunner() { return this.actions; }
  cashu = {
    checkProofsStates: async (proofs: unknown[]) => proofs.map(() => ({ state: "UNSPENT" })),
  } as unknown as CashuWallet;
  protected override getCashuWallet = async () => this.cashu;
}
const restores: Array<() => void> = [];
afterEach(() => restores.splice(0).forEach(restore => restore()));

function memoryCouch(initial: Token[] = []): Couch {
  const tokens = [...initial];
  return {
    getAll: () => [...tokens],
    clear: () => { tokens.length = 0; },
    remove: token => { const i = tokens.indexOf(token); if (i !== -1) tokens.splice(i, 1); },
    store: token => { tokens.push(token); return () => { const i = tokens.indexOf(token); if (i !== -1) tokens.splice(i, 1); }; },
  };
}

async function fixture() {
  const store = new EventStore();
  store.add(await WalletFactory.create([mint], undefined, ["wss://wallet.example"]).sign(signer));
  let accepted = false;
  const pool = {
    status$: of({}),
    publish: async () => [{ ok: accepted, from: "wss://wallet.example", message: accepted ? "" : "blocked: fixture" }],
  } as unknown as RelayPool;
  const couch = createCouch();
  const wallet = new FixtureWallet({ pubkey: await signer.getPublicKey(), signer, eventStore: store, pool, couch });
  return { store, wallet, couch, accept: () => { accepted = true; } };
}

describe("wallet persistence and recovery", () => {
  test("a request that succeeds before its transaction aborts is not a durable backup", async () => {
    const couch = createCouch();
    const add = IDBObjectStore.prototype.add;
    const mock = spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = add.apply(this, args);
      request.addEventListener("success", () => this.transaction.abort());
      return request;
    });
    restores.push(() => mock.mockRestore());
    await expect(couch.store(token())).rejects.toThrow("aborted");
    expect(await couch.getAll()).toEqual([]);
  });

  test("a failed database open can be retried", async () => {
    const factory = new IDBFactory();
    const open = spyOn(factory, "open").mockImplementationOnce(() => { throw new Error("temporary storage failure"); });
    restores.push(() => open.mockRestore());
    const couch = createCouch(factory);
    await expect(couch.store(token())).rejects.toThrow("temporary storage failure");
    const remove = await couch.store(token());
    expect(await couch.getAll()).toHaveLength(1);
    await remove();
    expect(await couch.getAll()).toEqual([]);
  });

  test("offline recovery preserves full v2 keyset identifiers", async () => {
    const couch = createCouch();
    const value = token();
    value.proofs[0]!.id = `01${"cd".repeat(32)}`;
    await couch.store(value);
    expect((await couch.getAll())[0]?.proofs[0]?.id).toBe(value.proofs[0]!.id);
  });

  test("reads the existing v1 record format and refuses to silently discard corrupt entries", async () => {
    const factory = new IDBFactory();
    const request = factory.open("fixture-wallet", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("operation-couch", { keyPath: "id" });
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const seed = async (record: unknown) => {
      const transaction = db.transaction("operation-couch", "readwrite");
      transaction.objectStore("operation-couch").add(record);
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
    };
    await seed({ id: "legacy-id", encodedToken: getEncodedToken(token()) });
    const couch = createCouch(factory);
    expect(getEncodedToken((await couch.getAll())[0]!)).toBe(getEncodedToken(token()));
    await seed({ id: "damaged-id", encodedToken: "damaged" });
    await expect(couch.getAll()).rejects.toThrow();
    const count = db.transaction("operation-couch").objectStore("operation-couch").count();
    expect(await new Promise<number>(resolve => { count.onsuccess = () => resolve(count.result); })).toBe(2);
    db.close();
  });

  test("partial migration retries preserve the source and do not duplicate a committed copy", async () => {
    const first = token("first"); const second = token("second");
    const source = memoryCouch([first, second]); const destination = memoryCouch();
    const store = destination.store.bind(destination);
    let calls = 0;
    destination.store = value => { if (++calls === 2) throw new Error("disk full"); return store(value); };
    const migrate = createCouchMigration(source, destination);
    await expect(migrate()).rejects.toThrow("disk full");
    expect(await source.getAll()).toEqual([second]);
    expect(await destination.getAll()).toEqual([first]);
    // Simulate a crash after a destination commit but before source removal.
    await store(second);
    await migrate();
    expect(await source.getAll()).toEqual([]);
    expect(await destination.getAll()).toEqual([first, second]);
  });

  test("two rejected recoveries retain proofs; an accepted retry stores them before clearing the backup", async () => {
    const { store, wallet, couch, accept } = await fixture();
    await couch.store(token());
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        await wallet.recoverFromCouch();
        expect(store.getByFilters({ kinds: [7375] })).toHaveLength(0);
        expect(await couch.getAll()).toHaveLength(1);
      }
      accept();
      await wallet.recoverFromCouch();
      expect(store.getByFilters({ kinds: [7375] })).toHaveLength(1);
      expect(await couch.getAll()).toHaveLength(0);
    } finally { wallet.stop(); store.dispose(); }
  });

  test("closing a deposit before quote creation finishes never starts a payment waiter", async () => {
    const { store, wallet } = await fixture();
    let finishQuote!: (quote: MintQuoteBolt11Response) => void;
    wallet.createMintQuote = () => new Promise(resolve => { finishQuote = resolve; });
    const wait = spyOn(wallet, "waitForMintQuote");
    restores.push(() => wait.mockRestore());
    let shown = false;
    const controller = new AbortController();
    const pending = wallet.deposit({ method: "bolt11", mint, amount: 8, signal: controller.signal, onQuote: () => { shown = true; } });
    controller.abort();
    finishQuote({ quote: "fixture", request: "lnbc-fixture" } as MintQuoteBolt11Response);
    try {
      await expect(pending).rejects.toThrow();
      expect(shown).toBe(false);
      expect(wait).not.toHaveBeenCalled();
    } finally { wallet.stop(); store.dispose(); }
  });

  test("wallet mutations reject overlapping recovery and nutzaps before UI busy state renders", async () => {
    const { store, wallet, accept } = await fixture();
    accept();
    const publish = wallet.pool.publish;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    wallet.pool.publish = async (...args) => { await held; return publish(...args); };
    const first = wallet.setMints([mint]);
    try {
      await expect(wallet.recoverFromCouch()).rejects.toThrow("current wallet operation");
      const target = await signer.signEvent({ kind: 1, content: "fixture", tags: [], created_at: 1 });
      await expect(wallet.sendNutzap(target, { amount: 1, mint, recipientKey: target.pubkey })).rejects.toThrow("current wallet operation");
      release();
      await first;
      // The lock is released after the first operation settles.
      await wallet.recoverFromCouch();
      expect(await wallet.couch.getAll()).toEqual([]);
    } finally { release(); await first.catch(() => {}); wallet.stop(); store.dispose(); }
  });

  test("a rejected wallet configuration leaves the accepted version intact", async () => {
    const { store, wallet } = await fixture();
    const original = store.getReplaceable(17375, wallet.pubkey)!;
    try {
      await expect(wallet.setMints(["https://replacement.example"])).rejects.toThrow("fixture");
      expect(store.getReplaceable(17375, wallet.pubkey)?.id).toBe(original.id);
    } finally { wallet.stop(); store.dispose(); }
  });

  test("malformed nutzap keys are rejected before selecting or swapping proofs", async () => {
    const { store, wallet, couch } = await fixture();
    const swap = spyOn(wallet.actionRunner, "run");
    restores.push(() => swap.mockRestore());
    try {
      const target = await signer.signEvent({ kind: 1, content: "fixture", tags: [], created_at: 1 });
      await expect(wallet.sendNutzap(target, { amount: 1, mint, recipientKey: "02bad" })).rejects.toThrow("Invalid nutzap");
      expect(swap).not.toHaveBeenCalled();
      expect(await couch.getAll()).toEqual([]);
    } finally { wallet.stop(); store.dispose(); }
  });

  for (const accepted of [false, true]) {
    test(`nutzap ${accepted ? "acceptance clears" : "rejection retains"} the swapped proofs and change backup`, async () => {
      const { store, wallet, couch, accept } = await fixture();
      // This x-only public key starts with 02; it still needs a compression byte.
      const recipient = PrivateKeySigner.fromKey((441).toString(16).padStart(64, "0"));
      const pubkey = await recipient.getPublicKey();
      store.add(await recipient.signEvent({ kind: 10019, content: "", created_at: 1,
        tags: [["mint", mint, "sat"], ["pubkey", pubkey], ["relay", "wss://recipient.example"]] }));
      const target = await recipient.signEvent({ kind: 31237, content: "fixture", created_at: 1, tags: [["d", "fixture-station"]] });
      store.add(await WalletTokenFactory.create(token()).sign(signer));
      wallet.cashu = { ops: { send: () => ({ asP2PK: ({ pubkey }: { pubkey: string }) => ({ run: async () => ({
        keep: normalizeProofAmounts([{ ...token().proofs[0]!, amount: 4, secret: "change-proof" }]),
        send: normalizeProofAmounts([{ ...token().proofs[0]!, amount: 4, secret: JSON.stringify(["P2PK", { data: pubkey }]) }]),
      }) }) }) } } as unknown as CashuWallet;
      try {
        if (accepted) accept();
        const result = wallet.sendNutzap(target, { amount: 4, mint, recipientKey: pubkey });
        if (accepted) {
          await result;
          expect(store.getByFilters({ kinds: [9321] })).toHaveLength(1);
          expect(await couch.getAll()).toEqual([]);
        } else {
          await expect(result).rejects.toThrow("fixture");
          expect(store.getByFilters({ kinds: [9321] })).toHaveLength(0);
          const secrets = (await couch.getAll()).flatMap(token => token.proofs.map(proof => proof.secret));
          expect(secrets).toContain("change-proof");
          expect(secrets).toContain(JSON.stringify(["P2PK", { data: `02${pubkey}` }]));
        }
      } finally { wallet.stop(); store.dispose(); }
    });
  }
});
