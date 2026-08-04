import { use$ } from "applesauce-react/hooks";
import { useState, useCallback, useMemo, useEffect } from "react";
import type { NutWallet } from "applesauce-wallet/wallet";
import { useCurrentAccount } from "../../../lib/nostr/auth";
import {
  usePreferredMint,
  pickEffectiveMint,
} from "../../../stores/preferredMintStore";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { CopyableQR } from "../../QRCode";

export function SendCashu({ wallet, onDone }: { wallet: NutWallet; onDone: () => void }) {
  const balance = use$(wallet.balance$);
  const unlocked = use$(wallet.unlocked$) ?? false;
  const currentUser = useCurrentAccount();
  const preferredMint = usePreferredMint(currentUser?.pubkey);
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    token: string;
    amount: number;
  } | null>(null);
  // Default to the preferred mint when it has a positive balance, otherwise
  // leave on "auto" so TokensOperation picks the highest-balance mint.
  const [selectedMint, setSelectedMint] = useState<string | undefined>(() =>
    pickEffectiveMint(preferredMint, balance)
  );
  // Keep the preselected value in sync as the wallet/balance loads after
  // mount (the cast may not be ready on the first render).
  useEffect(() => {
    if (selectedMint) return;
    const next = pickEffectiveMint(preferredMint, balance);
    if (next) setSelectedMint(next);
    // Intentionally only re-run when preferredMint or balance change so the
    // user's manual selection is never overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredMint, balance]);

  const availableMints = useMemo(() => {
    if (!balance) return [];
    return Object.keys(balance).filter((mint) => (balance[mint] || 0) > 0);
  }, [balance]);

  const totalBalance = balance
    ? Object.values(balance).reduce((s, a) => s + a, 0)
    : 0;

  const handleSend = useCallback(async () => {
    if (!unlocked) return setError("Wallet must be unlocked");
    const sendAmount = parseInt(amount.trim(), 10);
    if (isNaN(sendAmount) || sendAmount <= 0)
      return setError("Enter a valid amount");
    if (sendAmount > totalBalance)
      return setError(`Insufficient balance (${totalBalance} sats)`);
    if (selectedMint && balance && (balance[selectedMint] || 0) < sendAmount) {
      return setError(`Mint balance: ${balance[selectedMint]} sats`);
    }

    setSending(true);
    setError(null);
    setCreated(null);

    try {
      const token = await wallet.sendToken(sendAmount, { mint: selectedMint });
      setCreated({ token, amount: sendAmount });
      setAmount("");
    } catch (err: any) {
      console.error("Send failed:", err);
      setError(err?.message || "Failed to create token");
      setCreated(null);
    } finally {
      setSending(false);
    }
  }, [wallet, unlocked, amount, selectedMint, totalBalance, balance]);

  if (created) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-center text-muted-foreground">
          Share this {created.amount} sat token. It can only be claimed once.
        </div>
        <CopyableQR value={created.token} size={200} />
        <Button variant="ghost" onClick={onDone} className="w-full" size="sm">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        type="number"
        placeholder={`Amount (max ${totalBalance} sats)`}
        value={amount}
        onChange={(e) => { setAmount(e.target.value); setError(null); }}
        disabled={sending}
        min="1"
      />

      {availableMints.length > 1 && (
        <select
          value={selectedMint || ""}
          onChange={(e) => setSelectedMint(e.target.value || undefined)}
          disabled={sending}
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

      <Button
        className="w-full"
        onClick={handleSend}
        disabled={sending || !amount.trim()}
        size="sm"
      >
        {sending ? "Creating..." : "Create Token"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
