import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { EventStore } from "applesauce-core";
import { PrivateKeySigner } from "applesauce-signers";
import { WalletFactory } from "applesauce-wallet/factories";
import { isEncryptedContentUnlocked } from "applesauce-core/helpers/encrypted-content";
import { of } from "rxjs";
import type { RelayPool } from "applesauce-relay";
import { WavefuncWallet } from "../src/lib/nostr/wallet";
import { ProtectedDecryptionCache } from "../src/lib/nostr/protectedDecryptionCache";
const passphrase = "long test passphrase";
const id = "a".repeat(64);
test("wallet cache encrypts at rest, locks across sessions and isolates accounts", async () => {
  const factory = new IDBFactory();
  const alice = new ProtectedDecryptionCache("alice", factory);
  await alice.ready;
  expect(alice.state$.value).toBe("disabled");
  await alice.unlock(passphrase);
  await alice.setItem(id, "private wallet content");
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = factory.open("wavefunc-wallet-decryption-cache-v1");
    r.onsuccess = () => resolve(r.result);
  });
  const record = await new Promise<any>((resolve) => {
    const r = db.transaction("accounts").objectStore("accounts").get("alice");
    r.onsuccess = () => resolve(r.result);
  });
  expect(JSON.stringify(record)).not.toContain("private wallet content");
  expect(record.entries[id].ciphertext).toBeInstanceOf(ArrayBuffer);
  alice.lock();
  expect(await alice.getItem(id)).toBeNull();
  const again = new ProtectedDecryptionCache("alice", factory);
  await again.ready;
  expect(again.state$.value).toBe("locked");
  await expect(again.unlock("wrong password here")).rejects.toThrow(
    "Incorrect passphrase",
  );
  await again.unlock(passphrase);
  expect(await again.getItem(id)).toBe("private wallet content");
  const bob = new ProtectedDecryptionCache("bob", factory);
  await bob.unlock(passphrase);
  expect(await bob.getItem(id)).toBeNull();
  await bob.setItem(id, "Bob");
  await again.clear();
  expect(await bob.getItem(id)).toBe("Bob");
  expect(again.state$.value).toBe("disabled");
  db.close();
});
test("locking during key derivation cancels unlock; clear cannot be undone by an in-flight write", async () => {
  const cache = new ProtectedDecryptionCache("alice", new IDBFactory());
  await cache.ready;
  const unlock = cache.unlock(passphrase);
  cache.lock();
  await expect(unlock).rejects.toThrow("cancelled");
  await cache.unlock(passphrase);
  const write = cache.setItem(id, "secret");
  const result = write.catch((error) => error);
  await cache.clear();
  await result;
  await cache.unlock(passphrase);
  expect(await cache.getItem(id)).toBeNull();
});
test("ciphertext swapped between events or accounts cannot be decrypted", async () => {
  const factory = new IDBFactory();
  const cache = new ProtectedDecryptionCache("alice", factory);
  await cache.unlock(passphrase);
  await cache.setItem(id, "secret");
  const db = await new Promise<IDBDatabase>((resolve) => {
    const r = factory.open("wavefunc-wallet-decryption-cache-v1");
    r.onsuccess = () => resolve(r.result);
  });
  await new Promise<void>((resolve) => {
    const tx = db.transaction("accounts", "readwrite");
    const store = tx.objectStore("accounts");
    const r = store.get("alice");
    r.onsuccess = () => {
      const row = r.result;
      row.entries["b".repeat(64)] = row.entries[id];
      const bytes = new Uint8Array(row.entries[id].ciphertext);
      bytes[0] = bytes[0]! ^ 255;
      store.put(row, "alice");
    };
    tx.oncomplete = () => resolve();
  });
  expect(await cache.getItem("b".repeat(64))).toBeNull();
  expect(await cache.getItem(id)).toBeNull();
  db.close();
});

test("wallet integration restores cache before signer decryption and drops the session key on stop", async () => {
  const signer = PrivateKeySigner.fromKey("7".repeat(64));
  const pubkey = await signer.getPublicKey();
  const store = new EventStore();
  const event = JSON.parse(
    JSON.stringify(
      await WalletFactory.create(["https://mint.example"], undefined, [
        "wss://wallet.example",
      ]).sign(signer),
    ),
  );
  store.add(event);
  let decryptions = 0;
  const originalDecrypt = signer.nip44.decrypt;
  signer.nip44.decrypt = async (...args) => {
    decryptions++;
    return originalDecrypt(...args);
  };
  const cache = new ProtectedDecryptionCache(pubkey, new IDBFactory());
  const wallet = new WavefuncWallet({
    pubkey,
    signer,
    eventStore: store,
    pool: { status$: of({}) } as unknown as RelayPool,
    couch: {
      getAll: () => [],
      store: () => () => {},
      remove: () => {},
      clear: () => {},
    },
    decryptionCache: cache,
  });
  try {
    await wallet.unlockDecryptionCache(passphrase);
    expect(decryptions).toBeGreaterThan(0);
    expect(await cache.getItem(event.id)).toBeString();
    await wallet.lock();
    expect(cache.state$.value).toBe("locked");
    const before = decryptions;
    await wallet.unlockDecryptionCache(passphrase);
    expect(decryptions).toBe(before);
    expect(isEncryptedContentUnlocked(store.getEvent(event.id)!)).toBe(true);
    wallet.stop();
    expect(cache.state$.value).toBe("locked");
    expect(isEncryptedContentUnlocked(store.getEvent(event.id)!)).toBe(false);
  } finally {
    wallet.stop();
    signer.nip44.decrypt = originalDecrypt;
  }
});
