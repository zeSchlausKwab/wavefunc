import type { SerializedSwapPreview } from "@cashu/cashu-ts";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import type { ISigner } from "applesauce-signers";
import { getReplaceableAddressForEvent } from "applesauce-core/helpers/pointers";
import { WalletRecordStore } from "./walletCouch";

export type PendingNutzap = {
  phase: "swap";
  target: NostrEvent;
  recipientKey: string;
  mint: string;
  relays: string[];
  comment?: string;
  spent: NostrEvent[];
  preview: SerializedSwapPreview;
  unselected: string[];
} | {
  phase: "sign";
  mint: string;
  relays: string[];
  template: EventTemplate;
  spent: NostrEvent[];
  change: string[];
} | {
  phase: "publish";
  event: NostrEvent;
  relays: string[];
  accounting: NostrEvent[];
  walletRelays?: string[];
  delivered: boolean;
};

export function nutzapOperationId(sender: string, target: NostrEvent, amount: number) {
  return JSON.stringify([sender, getReplaceableAddressForEvent(target) ?? target.id, amount]);
}

/** Applesauce's token couch cannot represent an outgoing payment. Keep a separate
 * record so recovery of spendable tokens can never import recipient-locked proofs.
 * Prepared inputs and change are bearer funds, encrypted to the sending account. */
export class NutzapJournal {
  constructor(private readonly records = new WalletRecordStore("wavefunc-pending-nutzaps", "payments")) {}

  async amounts(sender: string, target: NostrEvent): Promise<number[]> {
    const prefix = JSON.stringify([sender, getReplaceableAddressForEvent(target) ?? target.id]).slice(0, -1) + ",";
    const keys = await this.records.transaction("readonly", store => store.getAllKeys());
    return keys.flatMap(key => typeof key === "string" && key.startsWith(prefix) ? [JSON.parse(key)[2]] : []);
  }

  async read(id: string, sender: string, signer: ISigner): Promise<PendingNutzap | undefined> {
    const record = await this.records.transaction("readonly", store => store.get(id));
    if (!record) return;
    if (!signer.nip44) throw new Error("NIP-44 encryption is required for nutzap recovery");
    return JSON.parse(await signer.nip44.decrypt(sender, record.sealed));
  }

  async save(id: string, sender: string, signer: ISigner, pending: PendingNutzap, insert = false) {
    if (!signer.nip44) throw new Error("NIP-44 encryption is required for nutzap recovery");
    const sealed = await signer.nip44.encrypt(sender, JSON.stringify(pending));
    await this.records.transaction("readwrite", store => insert ? store.add({ id, sealed }) : store.put({ id, sealed }));
  }

  async remove(id: string) {
    await this.records.transaction("readwrite", store => store.delete(id));
  }
}
