import { use$ } from "applesauce-react/hooks";
import { useState, useCallback, useEffect, useRef } from "react";
import type { Wallet } from "applesauce-wallet/casts";
import { AddToken } from "applesauce-wallet/actions";
import {
  Wallet as CashuWallet,
  MintQuoteState,
} from "@cashu/cashu-ts";
import { actions } from "../../../lib/nostr/store";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { CopyableQR } from "../../QRCode";

export function ReceiveLightning({ wallet, onDone }: { wallet: Wallet; onDone: () => void }) {
  const mints = use$(wallet.mints$);
  const [selectedMint, setSelectedMint] = useState(mints?.[0] || "");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{
    mint: string;
    quote: string;
    request: string;
    amount: number;
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "generating" | "waiting" | "paid" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!selectedMint && mints?.[0]) setSelectedMint(mints[0]);
  }, [mints, selectedMint]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCreate = useCallback(async () => {
    if (!wallet.unlocked) return setError("Wallet must be unlocked");
    const sats = parseInt(amount.trim(), 10);
    if (isNaN(sats) || sats <= 0) return setError("Enter a valid amount");
    if (!selectedMint) return setError("Select a mint");

    setError(null);
    setStatus("generating");

    try {
      const cashuWallet = new CashuWallet(selectedMint);
      await cashuWallet.loadMint();
      const mintQuote = await cashuWallet.createMintQuote(sats);
      setQuote({
        mint: selectedMint,
        quote: mintQuote.quote,
        request: mintQuote.request,
        amount: sats,
      });
      setStatus("waiting");

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const check = await cashuWallet.checkMintQuote(mintQuote.quote);
          if (check.state === MintQuoteState.PAID) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            const proofs = await cashuWallet.mintProofs(sats, mintQuote.quote);
            const token = { mint: selectedMint, proofs, unit: "sat" as const };
            await actions.run(AddToken, token, { addHistory: true });
            setStatus("paid");
          } else if (check.state === MintQuoteState.ISSUED) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setStatus("paid");
          }
        } catch (err) {
          console.error("Poll error:", err);
        }
      }, 3000);
    } catch (err: any) {
      console.error("Create quote failed:", err);
      setError(err?.message || "Failed to create invoice");
      setStatus("error");
    }
  }, [wallet.unlocked, amount, selectedMint]);

  const reset = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setQuote(null);
    setAmount("");
    setStatus("idle");
    setError(null);
  };

  if (status === "paid") {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="text-3xl">⚡</div>
        <div className="font-semibold text-green-600">
          Received {quote?.amount} sats
        </div>
        <Button variant="outline" onClick={() => { reset(); onDone(); }} size="sm" className="w-full">
          Done
        </Button>
      </div>
    );
  }

  if (quote && status === "waiting") {
    return (
      <div className="space-y-3">
        <div className="text-center text-xs text-muted-foreground">
          Waiting for payment of {quote.amount} sats
        </div>
        <CopyableQR value={quote.request} label="Lightning invoice" size={200} />
        <Button onClick={reset} variant="outline" size="sm" className="w-full">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mints && mints.length > 1 && (
        <select
          value={selectedMint}
          onChange={(e) => setSelectedMint(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          disabled={status === "generating"}
        >
          {mints.map((m) => (
            <option key={m} value={m}>
              {new URL(m).hostname}
            </option>
          ))}
        </select>
      )}

      <Input
        type="number"
        value={amount}
        onChange={(e) => { setAmount(e.target.value); setError(null); }}
        placeholder="Amount (sats)"
        disabled={status === "generating"}
        min="1"
      />

      <Button
        onClick={handleCreate}
        disabled={status === "generating" || !amount.trim() || !selectedMint}
        className="w-full"
        size="sm"
      >
        {status === "generating" ? "Creating..." : "Create Invoice"}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
