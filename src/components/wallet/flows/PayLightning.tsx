import { use$ } from "applesauce-react/hooks";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { NutWallet } from "applesauce-wallet/wallet";
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
  if (bitcoinMatch?.[1]) value = decodeURIComponent(bitcoinMatch[1]);
  return value;
}

export function PayLightning({ wallet, onDone }: { wallet: NutWallet; onDone: () => void }) {
  const balance = use$(wallet.balance$);
  const unlocked = use$(wallet.unlocked$) ?? false;
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
    if (!unlocked) return setError("Wallet must be unlocked");
    if (!invoice.trim()) return setError("Paste a lightning invoice");

    setPaying(true);
    setError(null);
    setSuccess(null);

    try {
      const bolt11 = normalizeInvoice(invoice);
      const mint =
        selectedMint && (balance?.[selectedMint] ?? 0) > 0
          ? selectedMint
          : pickEffectiveMint(preferredMint, balance);
      if (!mint) throw new Error("No mint with a balance to pay from");

      const response = await wallet.payInvoice(mint, bolt11);
      const paidAmount = response.quote.amount.toNumber();

      setSuccess({ amount: paidAmount });
      setInvoice("");
    } catch (err: any) {
      console.error("Pay failed:", err);
      setError(err?.message || "Failed to pay invoice");
    } finally {
      setPaying(false);
    }
  }, [wallet, unlocked, invoice, selectedMint, balance, preferredMint]);

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
