import { useState } from "react";
import {
  History,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  QrCode,
  Undo2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "../ui/button";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { getSentTokenById, markTokenAsReclaimed } from "../../lib/sentTokensDb";

export interface Transaction {
  id: string;
  type: "deposit" | "withdraw" | "send" | "receive";
  amount: number;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  memo?: string;
  mint?: string;
}

interface HistoryTabProps {
  transactions: Transaction[];
  cashuWallet?: NDKCashuWallet;
  onBalanceUpdate?: () => Promise<void>;
  onTransactionsUpdate?: () => Promise<void>;
}

export function HistoryTab({
  transactions,
  cashuWallet,
  onBalanceUpdate,
  onTransactionsUpdate,
}: HistoryTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showQRId, setShowQRId] = useState<string | null>(null);
  const [reclaimingId, setReclaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleReclaimToken = async (tx: Transaction) => {
    if (!cashuWallet || !onBalanceUpdate || !onTransactionsUpdate) return;

    // Extract token ID from the transaction ID (format: "sent-{tokenId}")
    const tokenId = tx.id.replace("sent-", "");
    const sentToken = getSentTokenById(tokenId);

    if (!sentToken) {
      setError("Token not found");
      return;
    }

    setReclaimingId(tx.id);
    setError(null);

    try {
      // Receive the token back into the wallet
      const result = await cashuWallet.receiveToken(
        sentToken.token,
        `Reclaimed token ${tokenId}`
      );

      if (!result) {
        throw new Error("Failed to reclaim token");
      }

      // Mark as reclaimed in the database
      markTokenAsReclaimed(tokenId);

      // Refresh UI
      await onBalanceUpdate();
      await onTransactionsUpdate();
    } catch (error) {
      console.error("Failed to reclaim token:", error);
      setError(
        error instanceof Error ? error.message : "Failed to reclaim token"
      );
    } finally {
      setReclaimingId(null);
    }
  };

  const isSentToken = (tx: Transaction) => {
    return (
      tx.type === "send" && tx.status === "pending" && tx.id.startsWith("sent-")
    );
  };

  const getSentTokenData = (tx: Transaction) => {
    if (!isSentToken(tx)) return null;
    const tokenId = tx.id.replace("sent-", "");
    return getSentTokenById(tokenId);
  };

  return (
    <div className="space-y-4 max-w-full">
      <div className="rounded-lg border border-border p-2 md:p-4 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Transaction History
          </h3>
          <p className="text-sm text-muted-foreground">
            View all your Cashu wallet transactions
          </p>
        </div>

        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No transactions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your transaction history will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const sentToken = getSentTokenData(tx);
              const hasSentToken = !!sentToken;

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div
                    className={`p-2 rounded-full ${
                      tx.type === "deposit" || tx.type === "receive"
                        ? "bg-green-500/10 text-green-600"
                        : "bg-orange-500/10 text-orange-600"
                    }`}
                  >
                    {tx.type === "deposit" || tx.type === "receive" ? (
                      <TrendingDown className="w-5 h-5" />
                    ) : (
                      <TrendingUp className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium capitalize">{tx.type}</h4>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          tx.status === "completed"
                            ? "bg-green-500/10 text-green-600"
                            : tx.status === "pending"
                            ? "bg-yellow-500/10 text-yellow-600"
                            : "bg-red-500/10 text-red-600"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
                    </p>
                    {tx.memo && (
                      <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                        {tx.memo}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-lg font-semibold ${
                        tx.amount > 0 ? "text-green-600" : "text-orange-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {formatAmount(Math.abs(tx.amount))}
                    </p>
                    <p className="text-xs text-muted-foreground">sats</p>
                  </div>

                  {/* Action buttons for sent tokens */}
                  {hasSentToken && sentToken && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(sentToken.token, tx.id)}
                        title="Copy token"
                      >
                        {copiedId === tx.id ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowQRId(tx.id)}
                        title="Show QR code"
                      >
                        <QrCode className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReclaimToken(tx)}
                        disabled={reclaimingId === tx.id}
                        title="Reclaim token"
                      >
                        <Undo2
                          className={`w-4 h-4 ${
                            reclaimingId === tx.id ? "animate-spin" : ""
                          }`}
                        />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {showQRId &&
        (() => {
          const tx = transactions.find((t) => t.id === showQRId);
          const sentToken = tx ? getSentTokenData(tx) : null;

          return sentToken ? (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-background rounded-lg p-2 md:p-4 max-w-md w-full space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Cashu Token QR Code</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowQRId(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex justify-center p-2 md:p-4 bg-white rounded-lg">
                  <QRCodeSVG value={sentToken.token} size={256} level="M" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground text-center">
                    {formatAmount(Math.abs(sentToken.amount))} sats
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(sentToken.token, showQRId)}
                    className="w-full"
                  >
                    {copiedId === showQRId ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Token
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : null;
        })()}
    </div>
  );
}
