import { use$ } from "applesauce-react/hooks";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { Wallet } from "applesauce-wallet/casts";
import { TokensOperation } from "applesauce-wallet/actions";
import { actions, couch } from "../../../lib/nostr/store";
import { useCurrentAccount } from "../../../lib/nostr/auth";
import {
  usePreferredMint,
  pickEffectiveMint,
} from "../../../stores/preferredMintStore";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { QRScanner } from "../../QRScanner";

function normalizeInvoice(raw: string): string {
  let value = raw.trim();
  if (value.toLowerCase().startsWith("lightning:")) {
    value = value.slice("lightning:".length);
  }
  const bitcoinMatch = value.match(/[?&]lightning=([^&]+)/i);
  if (bitcoinMatch) value = decodeURIComponent(bitcoinMatch[1]);
  return value;
}

export function PayLightning({ wallet, onDone }: { wallet: Wallet; onDone: () => void }) {
  const balance = use$(wallet.balance$);
  const currentUser = useCurrentAccount();
  const preferredMint = usePreferredMint(currentUser?.pubkey);
  const [invoice, setInvoice] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedMint, setSelectedMint] = useState<string | undefined>(() =>
    pickEffectiveMint(preferredMint, balance)
  );

  // Re-resolve the default selection once the wallet balance loads.
  useEffect(() => {
    if (selectedMint) return;
    const next = pickEffectiveMint(preferredMint, balance);
    if (next) setSelectedMint(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredMint, balance]);

  const availableMints = useMemo(() => {
    if (!balance) return [];
    return Object.keys(balance).filter((mint) => (balance[mint] ?? 0) > 0);
  }, [balance]);

  const totalBalance = balance
    ? Object.values(balance).reduce((s, a) => s + a, 0)
    : 0;

  const handlePay = useCallback(async () => {
    if (!wallet.unlocked) return setError("Wallet must be unlocked");
    if (!invoice.trim()) return setError("Paste a lightning invoice");

    setPaying(true);
    setError(null);
    setSuccess(null);

    try {
      const bolt11 = invoice.trim().toLowerCase();
      let paidAmount = 0;

      // If a specific mint is selected (preferred or user-picked), constrain
      // TokensOperation to it. Otherwise let it auto-pick.
      const mintConstraint =
        selectedMint && (balance?.[selectedMint] ?? 0) > 0
          ? selectedMint
          : undefined;

      const availableForMelt = mintConstraint
        ? balance?.[mintConstraint] ?? 0
        : totalBalance;

      await actions.run(
        TokensOperation,
        Math.max(100, Math.ceil(availableForMelt * 0.1)),
        async ({ selectedProofs, cashuWallet }) => {
          const meltQuote = await cashuWallet.createMeltQuoteBolt11(bolt11);
          paidAmount = meltQuote.amount;
          const totalNeeded = meltQuote.amount + meltQuote.fee_reserve;
          if (totalNeeded > availableForMelt) {
            throw new Error(
              `Need ${totalNeeded} sats (${meltQuote.amount} + ${meltQuote.fee_reserve} fee), have ${availableForMelt}${mintConstraint ? ` in selected mint` : ""}`
            );
          }
          const { keep, send } = await cashuWallet.send(
            totalNeeded,
            selectedProofs,
            { includeFees: true }
          );
          const meltResponse = await cashuWallet.meltProofs(meltQuote, send);
          return { change: [...keep, ...(meltResponse.change || [])] };
        },
        { mint: mintConstraint, couch }
      );

      setSuccess({ amount: paidAmount });
      setInvoice("");
    } catch (err: any) {
      console.error("Pay failed:", err);
      setError(err?.message || "Failed to pay invoice");
    } finally {
      setPaying(false);
    }
  }, [wallet.unlocked, invoice, totalBalance, selectedMint, balance]);

  if (success) {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="text-3xl">⚡</div>
        <div className="font-semibold text-green-600">
          Paid {success.amount} sats
        </div>
        <Button variant="outline" onClick={onDone} size="sm" className="w-full">
          Done
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <Textarea
          placeholder="lnbc..."
          value={invoice}
          onChange={(e) => { setInvoice(e.target.value); setError(null); }}
          disabled={paying}
          className="font-mono text-xs h-20"
        />

        {availableMints.length > 1 && (
          <select
            value={selectedMint || ""}
            onChange={(e) => setSelectedMint(e.target.value || undefined)}
            disabled={paying}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Auto-select mint</option>
            {availableMints.map((mint) => (
              <option key={mint} value={mint}>
                {new URL(mint).hostname} ({balance?.[mint] || 0} sats)
              </option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => setScanning(true)}
            disabled={paying}
            size="sm"
          >
            📷 Scan
          </Button>
          <Button
            onClick={handlePay}
            disabled={paying || !invoice.trim()}
            size="sm"
          >
            {paying ? "Paying..." : "Pay"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {scanning && (
        <QRScanner
          onScan={(data) => {
            setInvoice(normalizeInvoice(data));
            setError(null);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </>
  );
}
