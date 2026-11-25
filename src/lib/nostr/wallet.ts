import { NutWallet, type NutWalletOptions, type DepositOptions, type NutWalletOperation } from "applesauce-wallet/wallet";
import { deserializeProofs, deserializeSwapPreview, normalizeProofAmounts, serializeProofs, serializeSwapPreview } from "@cashu/cashu-ts";
import { CompleteSpend } from "applesauce-wallet/actions";
import { NutzapFactory } from "applesauce-wallet/factories";
import { getAddressPointerForEvent, getEventPointerForEvent } from "applesauce-core/helpers/pointers";
import type { NostrEvent } from "applesauce-core/helpers/event";
import {
  dumbTokenSelection, getNutzapInfoMints, getNutzapInfoPubkey, getNutzapInfoRelays, getProofP2PKPubkey,
  isTokenContentUnlocked, NUTZAP_INFO_KIND, unlockTokenContent, WALLET_TOKEN_KIND,
} from "applesauce-wallet/helpers";
import { NutzapJournal, nutzapOperationId, type PendingNutzap } from "./nutzapJournal";
import { getRelayPolicy } from "../../config/nostr";
import { resolvePublicDelivery } from "./publicDelivery";
import { getEncryptedContent } from "applesauce-core/helpers/encrypted-content";
import { ProtectedDecryptionCache } from "./protectedDecryptionCache";
import { publishAccepted, publishWithMirrors } from "./transport";

/** A failed publication must never look like a recovered token in the local
 * store: the next recovery would skip it and clear its only durable backup. */
export class WavefuncWallet extends NutWallet {
  private mutationRunning = false;
  private sessionStopped = false;
  private lockRevision = 0;
  readonly protectedCache: ProtectedDecryptionCache | undefined;

  constructor(options: NutWalletOptions, private readonly nutzaps = new NutzapJournal()) {
    super(options);
    this.actions.saveToStore = false;
    this.protectedCache = options.decryptionCache instanceof ProtectedDecryptionCache ? options.decryptionCache : undefined;
  }

  protected override async persistToCache(events: NostrEvent[]): Promise<void> {
    if (this.protectedCache && this.protectedCache.state$.value !== "unlocked") return;
    await super.persistToCache(events);
  }

  async unlockDecryptionCache(passphrase: string): Promise<void> {
    if (!this.protectedCache || this.sessionStopped) throw new Error("Wallet session is closed");
    await this.protectedCache.unlock(passphrase);
    if (this.sessionStopped) { this.protectedCache.lock(); return; }
    await this.unlock();
    for (const event of this.getEncryptedEvents()) {
      const content = getEncryptedContent(event);
      if (content) await this.protectedCache.setItem(event.id, content);
    }
  }

  override async unlock(): Promise<void> {
    if (this.sessionStopped) return;
    const revision = this.lockRevision;
    await super.unlock();
    if (this.sessionStopped || revision !== this.lockRevision) await super.lock();
    else this.setAutoUnlock(true);
  }

  override async lock(): Promise<void> {
    this.lockRevision++;
    this.setAutoUnlock(false);
    this.protectedCache?.lock();
    await super.lock();
  }

  override stop(): void {
    this.sessionStopped = true;
    this.protectedCache?.lock();
    super.stop();
    void super.lock();
  }

  protected override async publish(event: NostrEvent, relays?: string[]): Promise<void> {
    // NIP-61 delivers the locked proofs to the recipient before public mirrors.
    // An acknowledgement from the sender's wallet would not confirm delivery.
    const results = event.kind === 9321
      ? await publishWithMirrors(this.pool, event, relays ?? [], async () => {
          const plan = await resolvePublicDelivery(this.eventStore, this.pool, getRelayPolicy(), event);
          return plan.targets;
        })
      : await publishAccepted(this.pool, this.resolvePublishRelays(relays), event);
    for (const result of results) if (result.ok) this.eventStore.add(event, result.from);
  }

  protected override async track<T>(name: NutWalletOperation, operation: () => Promise<T>): Promise<T> {
    // Quote reads, unlocking, and relay backup may overlap. Proof changes and
    // configuration writes must not race, even before React renders busy state.
    if (["mintQuote", "unlock", "lock", "sync"].includes(name)) return super.track(name, operation);
    if (this.mutationRunning) throw new Error("Wait for the current wallet operation to finish");
    this.mutationRunning = true;
    try { return await super.track(name, operation); }
    finally { this.mutationRunning = false; }
  }

  pendingNutzapAmounts(target: NostrEvent) {
    return this.nutzaps.amounts(this.pubkey, target);
  }

  async sendNutzap(target: NostrEvent, options: { amount: number; mint?: string; recipientKey?: string; comment?: string; resumeOnly?: boolean }): Promise<void> {
    const id = nutzapOperationId(this.pubkey, target, options.amount);
    await this.track("send", async () => {
      const send = async () => {
        let pending = await this.nutzaps.read(id, this.pubkey, this.signer);
        if (!pending) {
          if (options.resumeOnly) throw new Error("This nutzap is no longer pending");
          pending = await this.prepareNutzap(target, options);
          // The unique key also prevents concurrent preparations from swapping twice.
          await this.nutzaps.save(id, this.pubkey, this.signer, pending, true);
        }
        await this.finishNutzap(id, pending);
      };
      if (globalThis.navigator?.locks) await navigator.locks.request(id, { ifAvailable: true }, lock => {
        if (!lock) throw new Error("This nutzap is already in progress in another tab");
        return send();
      });
      else await send();
    });
  }

  private async prepareNutzap(target: NostrEvent, options: { amount: number; mint?: string; recipientKey?: string; comment?: string }): Promise<Extract<PendingNutzap, { phase: "swap" }>> {
    if (!Number.isSafeInteger(options.amount) || options.amount <= 0) throw new Error("Invalid nutzap amount");
    const key = options.recipientKey?.toLowerCase() ?? "";
    const selectedKey = key.length === 64 ? `02${key}` : key;
    if (!/^02[0-9a-f]{64}$/.test(selectedKey)) throw new Error("Invalid nutzap recipient public key");
    const info = this.eventStore.getReplaceable(NUTZAP_INFO_KIND, target.pubkey);
    const relays = info ? getNutzapInfoRelays(info).filter(url => /^wss?:\/\//i.test(url)) : [];
    if (!info || !relays.length) throw new Error("The recipient has not advertised a nutzap delivery relay");
    const recipientKey = getNutzapInfoPubkey(info)?.toLowerCase();
    if (recipientKey !== selectedKey) throw new Error("The recipient's nutzap key changed. Review the payment and try again");
    const mint = getNutzapInfoMints(info).find(m => m.mint === options.mint && (!m.units?.length || m.units.includes("sat")))?.mint;
    if (!mint) throw new Error("The recipient does not accept sat nutzaps from this mint");

    const tokens = Array.from(this.eventStore.getByFilters({ kinds: [WALLET_TOKEN_KIND], authors: [this.pubkey] }));
    await Promise.all(tokens.map(token => isTokenContentUnlocked(token) || unlockTokenContent(token, this.signer).catch(() => undefined)));
    const selected = dumbTokenSelection(tokens, options.amount, mint);
    const cashu = await this.getCashuWallet(mint);
    const preview = await cashu.ops.send(options.amount, normalizeProofAmounts(selected.proofs)).asP2PK({ pubkey: recipientKey }).prepare();
    return {
      phase: "swap", target, recipientKey, mint, relays, comment: options.comment,
      spent: selected.events, preview: serializeSwapPreview(preview), unselected: serializeProofs(preview.unselectedProofs ?? []),
    };
  }

  private async finishNutzap(id: string, pending: PendingNutzap): Promise<void> {
    const save = (next: PendingNutzap) => this.nutzaps.save(id, this.pubkey, this.signer, next);
    if (pending.phase === "swap") {
      // Repeating a persisted preview sends identical inputs and blinded outputs (NUT-19).
      const cashu = await this.getCashuWallet(pending.mint);
      const { keep, send } = await cashu.completeSwap(deserializeSwapPreview(pending.preview));
      const { recipientKey } = pending;
      if (!send.length || send.some(p => getProofP2PKPubkey(p)?.toLowerCase() !== recipientKey)) {
        throw new Error("Mint proofs do not match the recipient's nutzap key");
      }
      const token = { mint: pending.mint, unit: "sat", proofs: send };
      let factory = NutzapFactory.forProfile(pending.target.pubkey, token, pending.comment).event(getEventPointerForEvent(pending.target));
      const address = getAddressPointerForEvent(pending.target);
      if (address) factory = factory.event(address);
      const template = await factory;
      pending = { phase: "sign", mint: pending.mint, relays: pending.relays, template, spent: pending.spent,
        change: [...pending.unselected, ...serializeProofs(keep)] };
      await save(pending);
    }
    if (pending.phase === "sign") {
      const { template, relays, mint, spent, change } = pending;
      const event = await this.signer.signEvent(template);
      for (const input of spent) await unlockTokenContent(input, this.signer);
      // Reuse the SDK's accounting events. Persist the signed batch before its first
      // publication so a partial wallet relay failure replays the same event IDs.
      const transaction: Extract<PendingNutzap, { phase: "publish" }> = {
        phase: "publish", event, relays, accounting: [], delivered: false,
      };
      await this.actions.run(() => async context => {
        await CompleteSpend(spent, { mint, unit: "sat", proofs: deserializeProofs(change) }, {
          createDeleteEvents: this.useDeleteEvents,
        })({ ...context, publish: async (events, walletRelays) => {
          transaction.accounting = [events].flat();
          transaction.walletRelays = walletRelays;
        } });
      });
      if (!transaction.accounting.length) throw new Error("Could not prepare wallet accounting for the nutzap");
      pending = transaction;
      await save(pending);
    }
    if (!pending.delivered) {
      await this.publish(pending.event, pending.relays);
      pending.delivered = true;
      await save(pending);
    }
    try {
      for (const entry of pending.accounting) await this.publish(entry, pending.walletRelays);
      await this.nutzaps.remove(id);
    } catch (cause) {
      throw new Error("Nutzap delivered. Retry to finish syncing your wallet.", { cause });
    }
  }

  override async deposit(options: DepositOptions): Promise<void> {
    options.signal?.throwIfAborted();
    await super.deposit({
      ...options,
      onQuote: quote => {
        // Quote creation itself cannot be cancelled in the SDK. Do not start a
        // payment waiter if the UI closed while that request was in flight.
        options.signal?.throwIfAborted();
        options.onQuote?.(quote);
      },
    });
  }
}
