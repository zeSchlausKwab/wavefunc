import { useState, useCallback } from "react";
import type { Wallet } from "applesauce-wallet/casts";
import { ReceiveToken } from "applesauce-wallet/actions";
import { getDecodedToken } from "@cashu/cashu-ts";
import { actions, couch } from "../../../lib/nostr/store";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { QRScanner } from "../../QRScanner";

function normalizeCashuToken(raw: string): string {
  let value = raw.trim();
  if (value.toLowerCase().startsWith("cashu:")) {
    value = value.slice("cashu:".length);
  }
  return value;
}

export function ReceiveCashu({ wallet, onDone }: { wallet: Wallet; onDone: () => void }) {
  const [tokenString, setTokenString] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [scanning, setScanning] = useState(false);

  const handleReceive = useCallback(async () => {
    if (!wallet.unlocked) return setError("Wallet must be unlocked");
    if (!tokenString.trim()) return setError("Paste a cashu token");

    setReceiving(true);
    setError(null);
    setSuccess(false);

    try {
      const token = getDecodedToken(tokenString.trim());
      if (!token) throw new Error("Failed to decode token");
      await actions.run(ReceiveToken, token, { couch });
      setTokenString("");
      setSuccess(true);
    } catch (err: any) {
      console.error("Receive failed:", err);
      setError(err?.message || "Failed to receive token");
    } finally {
      setReceiving(false);
    }
  }, [wallet.unlocked, tokenString]);

  if (success) {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="text-3xl">🥜</div>
        <div className="font-semibold text-green-600">Token received</div>
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
          placeholder="cashuA... or cashuB..."
          value={tokenString}
          onChange={(e) => { setTokenString(e.target.value); setError(null); }}
          disabled={receiving}
          className="font-mono text-xs h-20"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => setScanning(true)}
            disabled={receiving}
            size="sm"
          >
            📷 Scan
          </Button>
          <Button
            onClick={handleReceive}
            disabled={receiving || !tokenString.trim()}
            size="sm"
          >
            {receiving ? "Receiving..." : "Receive"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {scanning && (
        <QRScanner
          onScan={(data) => {
            setTokenString(normalizeCashuToken(data));
            setError(null);
            setScanning(false);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </>
  );
}
