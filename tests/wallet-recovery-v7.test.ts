import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { PrivateKeySigner } from "applesauce-signers";
import { WalletFactory, WalletTokenFactory } from "applesauce-wallet/factories";
import type { Couch } from "applesauce-wallet/helpers";
import type { RelayPool } from "applesauce-relay";
import { Amount, OutputData, serializeSwapPreview, type SwapPreview, getEncodedToken, normalizeProofAmounts, type Token, type Wallet as CashuWallet, type MintQuoteBolt11Response } from "@cashu/cashu-ts";
import { EMPTY, of } from "rxjs";
import { NutzapJournal } from "../src/lib/nostr/nutzapJournal";
import { WalletCouch, WalletRecordStore, createCouchMigration } from "../src/lib/nostr/walletCouch";
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
  const attempts: { urls: string[]; event: NostrEvent }[] = [];
  const pool = {
    status$: of({}), request: () => EMPTY,
    publish: async (urls: string[], event: NostrEvent) => {
      attempts.push({ urls, event });
      return urls.map(from => ({ ok: accepted, from, message: accepted ? "" : "blocked: fixture" }));
    },
  } as unknown as RelayPool;
  const couch = createCouch();
  const factory = new IDBFactory();
  const journal = () => new NutzapJournal(new WalletRecordStore("nutzaps", "payments", () => factory));
  const options = { pubkey: await signer.getPublicKey(), signer, eventStore: store, pool, couch };
  const restart = () => new FixtureWallet(options, journal());
  return { store, wallet: restart(), couch, restart, attempts, accept: () => { accepted = true; } };
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

  for (const failure of ["mint response", "recipient relay", "wallet accounting"] as const) {
    test(`resumes the same nutzap after interrupted ${failure}`, async () => {
      const { store, wallet, couch, restart, attempts, accept } = await fixture();
      const recipient = PrivateKeySigner.fromKey((441).toString(16).padStart(64, "0"));
      const pubkey = await recipient.getPublicKey();
      const advertise = async (time: number, relay: string, key: string, unit = "sat") => store.add(
        await recipient.signEvent({ kind: 10019, created_at: time, content: "",
          tags: [["mint", mint, unit], ["pubkey", key], ["relay", relay]] }),
      );
      const recipientRelay = "wss://recipient.example";
      const targetKind = failure === "recipient relay" ? 1 : 31237;
      const target = await recipient.signEvent({ kind: targetKind, content: "", created_at: 1,
        tags: targetKind === 1 ? [] : [["d", "station"]] });
      const input = await WalletTokenFactory.create(token()).sign(signer);
      store.add(input);
      const opts = { amount: 4, mint, recipientKey: pubkey, comment: "Original message" };
      let preparations = 0;
      const swaps: string[] = [];
      const inputProof = token().proofs[0]!;
      const cashu = {
        ops: { send: () => ({ asP2PK: ({ pubkey: key }: { pubkey: string }) => ({ prepare: async () => {
          preparations++;
          expect(key).toBe(`02${pubkey}`);
          return { amount: Amount.from(4), fees: Amount.from(0), keysetId: inputProof.id, inputs: [inputProof],
            sendOutputs: [OutputData.createSingleP2PKData({ pubkey: key }, 4, inputProof.id)],
            keepOutputs: [OutputData.createSingleRandomData(4, inputProof.id)] };
        } }) }) },
        completeSwap: async (preview: SwapPreview) => {
          swaps.push(JSON.stringify(serializeSwapPreview(preview)));
          if (failure === "mint response" && swaps.length === 1) throw new Error("lost mint response");
          return {
            keep: normalizeProofAmounts([{ ...inputProof, amount: 4, secret: "change-proof" }]),
            send: normalizeProofAmounts([{ ...inputProof, amount: 4, secret: JSON.stringify(["P2PK", { data: `02${pubkey}` }]) }]),
          };
        },
      } as unknown as CashuWallet;
      wallet.cashu = cashu;
      let resumed: FixtureWallet | undefined;
      try {
        // Incompatible units and a rotated key must be caught before selecting mint outputs.
        await advertise(1, recipientRelay, pubkey, "usd");
        await expect(wallet.sendNutzap(target, opts)).rejects.toThrow("does not accept");
        await advertise(2, recipientRelay, "ab".repeat(32));
        await expect(wallet.sendNutzap(target, opts)).rejects.toThrow("key changed");
        expect(preparations).toBe(0);
        await advertise(3, recipientRelay, pubkey);
        if (failure === "wallet accounting") {
          accept();
          const publish = wallet.pool.publish.bind(wallet.pool);
          wallet.pool.publish = async (urls, event, ...args) => {
            const ack = await publish(urls, event, ...args);
            return event.kind === 9321 ? ack : ack.map(result => ({ ...result, ok: false }));
          };
        }
        await expect(wallet.sendNutzap(target, opts)).rejects.toThrow();
        expect(await wallet.pendingNutzapAmounts(target)).toEqual([4]);
        if (target.kind === 1) {
          const otherNote = await recipient.signEvent({ kind: 1, content: "different note", created_at: 2, tags: [] });
          expect(await wallet.pendingNutzapAmounts(otherNote)).toEqual([]);
          await expect(wallet.sendNutzap(otherNote, { ...opts, resumeOnly: true })).rejects.toThrow("no longer pending");
        }
        expect(await couch.getAll()).toEqual([]);
        const prior = attempts.filter(a => a.event.kind === 9321);
        if (failure === "recipient relay") {
          expect(prior).toHaveLength(1);
          expect(prior[0]!.urls.map(url => url.replace(/\/$/, ""))).toEqual([recipientRelay]);
        }
        // Reload, lose all available funds and change the recipient's preferences.
        wallet.stop();
        store.remove(input);
        await advertise(4, "wss://replacement.example", "ab".repeat(32), "usd");
        resumed = restart();
        resumed.cashu = cashu;
        accept();
        if (failure === "wallet accounting") {
          resumed.pool.publish = async (urls, event) => {
            if (!Array.isArray(urls)) throw new Error("Expected concrete delivery targets");
            attempts.push({ urls, event });
            return urls.map(from => ({ ok: true, from }));
          };
        }
        await resumed.sendNutzap(target, { amount: 4, resumeOnly: true });
        expect(await resumed.pendingNutzapAmounts(target)).toEqual([]);
        await expect(wallet.sendNutzap(target, { ...opts, resumeOnly: true })).rejects.toThrow("no longer pending");
        expect(preparations).toBe(1);
        expect(new Set(swaps).size).toBe(1);
        expect(swaps).toHaveLength(failure === "mint response" ? 2 : 1);
        const sends = attempts.filter(a => a.event.kind === 9321);
        expect(new Set(sends.map(a => JSON.stringify(a.event))).size).toBe(1);
        expect(sends[0]!.event.content).toBe("Original message");
        expect(sends[0]!.event.tags.some(t => t[0] === "e" && t[1] === target.id)).toBe(true);
        expect(sends.at(-1)!.urls.every(url => !url.includes("replacement"))).toBe(true);
        expect(sends.at(-1)!.urls.some(url => !url.includes("recipient.example"))).toBe(true);
        if (failure === "wallet accounting") expect(sends).toEqual(prior);
        expect(store.getByFilters({ kinds: [9321] })).toHaveLength(1);
        expect(await couch.getAll()).toEqual([]);
      } finally { resumed?.stop(); wallet.stop(); store.dispose(); }
    });
  }
});
