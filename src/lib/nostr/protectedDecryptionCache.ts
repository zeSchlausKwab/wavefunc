import { BehaviorSubject } from "rxjs";

type Sealed = {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
  at: number;
};
type RecordData = {
  salt: Uint8Array<ArrayBuffer>;
  check: Sealed;
  entries: Record<string, Sealed>;
};
export type CacheState =
  | "loading"
  | "disabled"
  | "locked"
  | "unlocked"
  | "unavailable";
const encoder = new TextEncoder();
const CHECK = "wavefunc-wallet-cache-v1";
const MAX_AGE = 30 * 86400 * 1000;

/** A disposable acceleration cache, separate from durable proof backups.
 * Only a non-extractable session key lives in memory; IDB contains ciphertext. */
export class ProtectedDecryptionCache {
  readonly state$ = new BehaviorSubject<CacheState>("loading");
  private key: CryptoKey | null = null;
  private generation = 0;
  private keySalt = "";
  private database?: Promise<IDBDatabase>;
  readonly ready: Promise<void>;
  constructor(
    readonly pubkey: string,
    private factory: IDBFactory | undefined = globalThis.indexedDB,
    private dbName = "wavefunc-wallet-decryption-cache-v1",
  ) {
    this.ready = this.read()
      .then((record) => {
        if (this.state$.value === "loading")
          this.state$.next(record ? "locked" : "disabled");
      })
      .catch(() => {
        this.state$.next("unavailable");
      });
  }
  private open() {
    if (!this.factory || !globalThis.crypto?.subtle)
      return Promise.reject(
        new Error(
          "Encrypted caching requires secure browser storage and Web Crypto",
        ),
      );
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory!.open(this.dbName, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("accounts");
      request.onerror = () => {
        this.database = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        this.database = undefined;
        reject(new Error("Close another tab to update the cache"));
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.database = undefined;
          this.lock();
        };
        resolve(request.result);
      };
    }));
  }
  private async read(): Promise<RecordData | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("accounts", "readonly");
      const request = tx.objectStore("accounts").get(this.pubkey);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("Cache read aborted"));
      tx.onerror = () => {};
    });
  }
  private async change(
    update: (record: RecordData | undefined) => RecordData | undefined,
  ) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("accounts", "readwrite");
      const store = tx.objectStore("accounts");
      const request = store.get(this.pubkey);
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const next = update(request.result);
          if (next) store.put(next, this.pubkey);
          else store.delete(this.pubkey);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Cache write aborted"));
      tx.onerror = () => {};
    });
  }
  private aad(id: string) {
    return encoder.encode(`${CHECK}:${this.pubkey}:${id}`);
  }
  private async seal(
    key: CryptoKey,
    id: string,
    plaintext: string,
  ): Promise<Sealed> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return {
      iv,
      ciphertext: await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: this.aad(id) },
        key,
        encoder.encode(plaintext),
      ),
      at: Date.now(),
    };
  }
  private async decrypt(key: CryptoKey, id: string, value: Sealed) {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: value.iv, additionalData: this.aad(id) },
        key,
        value.ciphertext,
      ),
    );
  }
  async unlock(passphrase: string) {
    const operation = ++this.generation;
    await this.ready;
    if (operation !== this.generation)
      throw new Error("Cache unlock cancelled");
    this.key = null;
    const record = await this.read();
    this.state$.next(record ? "locked" : "disabled");
    if (passphrase.length < 12 || passphrase.length > 1024)
      throw new Error("Use a passphrase of at least 12 characters");
    const salt = record?.salt ?? crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    if (record) {
      try {
        if ((await this.decrypt(key, "check", record.check)) !== CHECK)
          throw new Error();
      } catch {
        throw new Error(
          "Incorrect passphrase or damaged cache. You can erase the cache and recreate it.",
        );
      }
    }
    const check = record?.check ?? (await this.seal(key, "check", CHECK));
    if (operation !== this.generation)
      throw new Error("Cache unlock cancelled");
    await this.change((current) => {
      if (operation !== this.generation)
        throw new Error("Cache unlock cancelled");
      if (
        record
          ? !current || String(current.salt) !== String(record.salt)
          : !!current
      )
        throw new Error("Cache changed in another tab. Try again.");
      return current ?? { salt, check, entries: {} };
    });
    if (operation !== this.generation)
      throw new Error("Cache unlock cancelled");
    this.keySalt = String(salt);
    this.key = key;
    this.state$.next("unlocked");
  }
  lock() {
    this.generation++;
    this.key = null;
    if (this.state$.value === "unlocked") this.state$.next("locked");
  }
  async clear() {
    this.lock();
    await this.change(() => undefined);
    this.state$.next("disabled");
  }
  async getItem(id: string): Promise<string | null> {
    const key = this.key,
      operation = this.generation;
    if (!key) return null;
    const record = await this.read(),
      entry = record?.entries[id];
    if (
      !record ||
      String(record.salt) !== this.keySalt ||
      !entry ||
      Date.now() - entry.at > MAX_AGE
    )
      return null;
    try {
      const text = await this.decrypt(key, id, entry);
      return operation === this.generation ? text : null;
    } catch {
      return null;
    }
  }
  async setItem(id: string, plaintext: string) {
    const key = this.key,
      operation = this.generation;
    // A rejection prevents Applesauce from marking content as persisted.
    if (!key) throw new Error("Decryption cache is locked");
    if (!/^[0-9a-f]{64}$/.test(id) || plaintext.length > 131_072)
      throw new Error("Invalid cache entry");
    const sealed = await this.seal(key, id, plaintext);
    await this.change((record) => {
      if (
        operation !== this.generation ||
        !record ||
        String(record.salt) !== this.keySalt
      )
        throw new Error("Cache session changed");
      const entries = Object.fromEntries(
        Object.entries(record.entries)
          .filter(
            ([key, value]) => key !== id && Date.now() - value.at < MAX_AGE,
          )
          .sort((a, b) => b[1].at - a[1].at)
          .slice(0, 499),
      );
      let bytes = sealed.ciphertext.byteLength;
      for (const [key, value] of Object.entries(entries)) {
        bytes += value.ciphertext.byteLength;
        if (bytes > 8_000_000) delete entries[key];
      }
      return { ...record, entries: { ...entries, [id]: sealed } };
    });
  }
}
