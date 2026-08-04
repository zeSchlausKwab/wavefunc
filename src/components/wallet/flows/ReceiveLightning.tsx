import { use$ } from "applesauce-react/hooks";
import { useState, useCallback, useEffect, useRef } from "react";
import type { MintQuoteBolt11Response } from "@cashu/cashu-ts";
import type { NutWallet } from "applesauce-wallet/wallet";
import { useCurrentAccount } from "../../../lib/nostr/auth";
import { usePreferredMint } from "../../../stores/preferredMintStore";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { CopyableQR } from "../../QRCode";
import { toLightningUri } from "../../../lib/openUrl";

export function ReceiveLightning({ wallet, onDone }: { wallet: NutWallet; onDone: () => void }) {
  const mints = use$(wallet.mintUrls$);
  const unlocked = use$(wallet.unlocked$) ?? false;
  const currentUser = useCurrentAccount();
  const preferredMint = usePreferredMint(currentUser?.pubkey);
  // Default to the preferred mint when it's still in the wallet's mint list,
  // otherwise pick the first available mint as before.
  const [selectedMint, setSelectedMint] = useState(
    preferredMint && mints?.includes(preferredMint)
      ? preferredMint
      : mints?.[0] || ""
  );
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{
    mint: string;
    response: MintQuoteBolt11Response;
    amount: number;
  } | null>(null);
  const [status, setStatus] = useState<
    "idle" | "generating" | "waiting" | "paid" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (selectedMint) return;
    if (preferredMint && mints?.includes(preferredMint)) {
      setSelectedMint(preferredMint);
    } else if (mints?.[0]) {
      setSelectedMint(mints[0]);
    }
  }, [mints, selectedMint, preferredMint]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCreate = useCallback(async () => {
    if (!unlocked) return setError("Wallet must be unlocked");
    const sats = parseInt(amount.trim(), 10);
    if (isNaN(sats) || sats <= 0) return setError("Enter a valid amount");
    if (!selectedMint) return setError("Select a mint");

    setError(null);
    setStatus("generating");

    try {
      const mintQuote = await wallet.createMintQuote(selectedMint, sats);
      setQuote({
        mint: selectedMint,
        response: mintQuote,
        amount: sats,
      });
      setStatus("waiting");

      const controller = new AbortController();
      abortRef.current = controller;
      await wallet.waitForMintQuote(selectedMint, mintQuote.quote, {
        signal: controller.signal,
      });
      await wallet.redeemMintQuote(selectedMint, sats, mintQuote);
      abortRef.current = null;
      setStatus("paid");
    } catch (err: any) {
      console.error("Create quote failed:", err);
      setError(err?.message || "Failed to create invoice");
      setStatus("error");
    }
  }, [wallet, unlocked, amount, selectedMint]);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
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
        <CopyableQR
          value={quote.response.request}
          qrValue={toLightningUri(quote.response.request)}
          actionUri={toLightningUri(quote.response.request)}
          label="Lightning invoice"
          size={200}
        />
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
