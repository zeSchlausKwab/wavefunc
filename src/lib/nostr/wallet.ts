import { NutWallet, type NutWalletOptions, type DepositOptions, type NutWalletOperation } from "applesauce-wallet/wallet";
import { NutzapEvent, TokensOperation } from "applesauce-wallet/actions";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { publishAccepted } from "./transport";

/** A failed publication must never look like a recovered token in the local
 * store: the next recovery would skip it and clear its only durable backup. */
export class WavefuncWallet extends NutWallet {
  private mutationRunning = false;

  constructor(options: NutWalletOptions) {
    super(options);
    this.actions.saveToStore = false;
  }

  protected override async publish(event: NostrEvent, relays?: string[]): Promise<void> {
    const results = await publishAccepted(this.pool, this.resolvePublishRelays(relays), event);
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

  async sendNutzap(target: NostrEvent, options: { amount: number; mint: string; recipientKey: string; comment?: string }): Promise<void> {
    await this.track("send", async () => {
      const key = options.recipientKey.toLowerCase();
      const pubkey = /^[0-9a-f]{64}$/.test(key) ? `02${key}` : key;
      if (!/^0[23][0-9a-f]{64}$/.test(pubkey)) throw new Error("Invalid nutzap recipient public key");
      let clearOutputs: (() => void | Promise<void>) | undefined;
      await this.actions.run(TokensOperation, options.amount, async ({ selectedProofs, mint, cashuWallet }) => {
        const { keep, send } = await cashuWallet.ops.send(options.amount, selectedProofs).asP2PK({ pubkey }).run();
        // The mint has replaced the inputs. Back up both outputs before any
        // relay work; the SDK's NutzapEvent couch option clears in finally,
        // including on rejection, so this boundary owns their cleanup instead.
        const outgoing = { mint, proofs: send, unit: "sat" };
        clearOutputs = await this.couch.store({ mint, proofs: [...keep, ...send], unit: "sat" });
        await this.actions.run(NutzapEvent, target, outgoing, { comment: options.comment });
        return { change: keep.length ? keep : undefined };
      }, { mint: options.mint, couch: this.couch, getCashuWallet: this.getCashuWallet, createDeleteEvents: this.useDeleteEvents });
      await clearOutputs?.();
      await this.refreshCouch();
    });
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
