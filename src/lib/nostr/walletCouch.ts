import { getDecodedToken, getEncodedToken, type Token } from "@cashu/cashu-ts";
import type { Couch } from "applesauce-wallet/helpers";

type StoredToken = { id: string; encodedToken: string; keysetIds?: string[] };

/** Keeps the SDK's v1 database format, but acknowledges writes only after commit.
 * This backup is independent of the disposable event cache and is never pruned. */
export class WalletCouch implements Couch {
  private opening?: Promise<IDBDatabase>;

  constructor(
    private readonly databaseName = "wavefunc-cashu",
    private readonly storeName = "operation-couch",
    private readonly factory = () => globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.factory();
      if (!factory) return reject(new Error("IndexedDB is not available for wallet recovery"));
      const request = factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(this.storeName)) {
          request.result.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
      request.onerror = () => reject(request.error ?? new Error("Could not open wallet recovery storage"));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); this.opening = undefined; };
        database.onclose = () => { this.opening = undefined; };
        resolve(database);
      };
    }).catch(error => { this.opening = undefined; throw error; });
    return this.opening;
  }

  private async transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode, { durability: "strict" });
      let result: T;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Wallet recovery transaction aborted"));
      try {
        const request = action(transaction.objectStore(this.storeName));
        request.onsuccess = () => { result = request.result; };
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  }

  async store(token: Token): Promise<() => Promise<void>> {
    const record: StoredToken = {
      id: crypto.randomUUID(),
      encodedToken: getEncodedToken(token),
      // Cashu v2 encoding shortens keyset IDs; preserve full IDs for offline recovery.
      keysetIds: [...new Set(token.proofs.map(proof => proof.id))],
    };
    await this.transaction("readwrite", store => store.add(record));
    return async () => { await this.transaction("readwrite", store => store.delete(record.id)); };
  }

  async getAll(): Promise<Token[]> {
    const records = await this.transaction<StoredToken[]>("readonly", store => store.getAll());
    // A corrupt entry must stop recovery, not disappear from a filtered list that
    // RecoverFromCouch would subsequently clear along with the healthy records.
    return records.map(record => getDecodedToken(record.encodedToken, record.keysetIds ?? []));
  }

  async remove(token: Token): Promise<void> {
    const encoded = getEncodedToken(token);
    const records = await this.transaction<StoredToken[]>("readonly", store => store.getAll());
    const record = records.find(record => record.encodedToken === encoded);
    if (record) await this.transaction("readwrite", store => store.delete(record.id));
  }

  async clear(): Promise<void> {
    await this.transaction("readwrite", store => store.clear());
  }
}

/** Transfer one committed token at a time; retries cannot duplicate a partially
 * migrated backup, and the source survives a failed destination write. */
export function createCouchMigration(source: Couch, destination: Couch) {
  let pending: Promise<void> | undefined;
  return () => pending ??= (async () => {
    const tokens = await source.getAll();
    if (!tokens.length) return;
    const present = new Set((await destination.getAll()).map(token => getEncodedToken(token)));
    for (const token of tokens) {
      const encoded = getEncodedToken(token);
      if (!present.has(encoded)) {
        await destination.store(token);
        present.add(encoded);
      }
      await source.remove(token);
    }
  })().catch(error => { pending = undefined; throw error; });
}
