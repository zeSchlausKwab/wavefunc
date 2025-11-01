import { useState, useEffect } from "react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { Send, RefreshCw, Undo2, Copy, Check, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "../ui/button";
import {
  getUnredeemedTokens,
  getTotalUnredeemedAmount,
  markTokenAsReclaimed,
  deleteSentToken,
  cleanupOldTokens,
  type SentToken,
} from "../../lib/sentTokensDb";

interface SentTokensTabProps {
  cashuWallet: NDKCashuWallet;
  onBalanceUpdate: () => Promise<void>;
  onTransactionsUpdate: () => Promise<void>;
}

export function SentTokensTab({
  cashuWallet,
  onBalanceUpdate,
  onTransactionsUpdate,
}: SentTokensTabProps) {
  const [sentTokens, setSentTokens] = useState<SentToken[]>([]);
  const [totalUnredeemed, setTotalUnredeemed] = useState(0);
  const [reclaimingId, setReclaimingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  const loadSentTokens = () => {
    const tokens = getUnredeemedTokens();
    setSentTokens(tokens);
    setTotalUnredeemed(getTotalUnredeemedAmount());
  };

  useEffect(() => {
    loadSentTokens();
    // Clean up old tokens on mount
    cleanupOldTokens();
  }, []);

  const handleReclaimToken = async (token: SentToken) => {
    if (!cashuWallet) return;

    setReclaimingId(token.id);
    setError(null);

    try {
      // Receive the token back into the wallet
      const result = await cashuWallet.receiveToken(
        token.token,
        `Reclaimed token ${token.id}`
      );

      if (!result) {
        throw new Error("Failed to reclaim token");
      }

      // Mark as reclaimed in the database
      markTokenAsReclaimed(token.id);

      // Refresh UI
      await onBalanceUpdate();
      await onTransactionsUpdate();
      loadSentTokens();
    } catch (error) {
      console.error("Failed to reclaim token:", error);
      setError(
        error instanceof Error ? error.message : "Failed to reclaim token"
      );
    } finally {
      setReclaimingId(null);
    }
  };

  const handleDeleteToken = (tokenId: string) => {
    deleteSentToken(tokenId);
    loadSentTokens();
  };

  const copyToClipboard = async (token: string, id: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="space-y-4 max-w-full">
      <div className="rounded-lg border border-border p-6 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Send className="w-5 h-5" />
            Sent Tokens
          </h3>
          <p className="text-sm text-muted-foreground">
            Tokens you've created and sent. Unredeemed tokens can be reclaimed.
          </p>
        </div>

        {totalUnredeemed > 0 && (
          <div className="p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
                  Unredeemed Tokens
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sentTokens.length} token{sentTokens.length !== 1 ? "s" : ""}{" "}
                  worth {formatAmount(totalUnredeemed)} sats
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSentTokens}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {error}
          </div>
        )}

        {sentTokens.length === 0 ? (
          <div className="text-center py-12">
            <Send className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No unredeemed sent tokens</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tokens you create will appear here until they're redeemed
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sentTokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 rounded-full bg-orange-500/10 text-orange-600">
                  <Send className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Token #{token.id}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600">
                      Unredeemed
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(token.createdAt, { addSuffix: true })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {new URL(token.mint).hostname}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold text-orange-600">
                    {formatAmount(token.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">sats</p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(token.token, token.id)}
                    title="Copy token"
                  >
                    {copiedId === token.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReclaimToken(token)}
                    disabled={reclaimingId === token.id}
                    title="Reclaim token"
                  >
                    {reclaimingId === token.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteToken(token.id)}
                    title="Delete (cannot reclaim after)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            💡 Tip: Tokens older than 30 days are automatically cleaned up. You
            can reclaim unredeemed tokens to get your sats back.
          </p>
        </div>
      </div>
    </div>
  );
}
