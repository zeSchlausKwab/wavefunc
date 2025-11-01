import { useState } from "react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { QRCodeSVG } from "qrcode.react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  ArrowUpFromLine,
  Coins,
  Copy,
  Check,
  RefreshCw,
  Scan,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

interface WithdrawTabProps {
  cashuWallet: NDKCashuWallet;
  balance: number;
  cashuConnection?: {
    mints?: string[];
    relays?: string[];
    primaryMint?: string;
  };
  onBalanceUpdate: () => Promise<void>;
  onTransactionsUpdate: () => Promise<void>;
}

export function WithdrawTab({
  cashuWallet,
  balance,
  cashuConnection,
  onBalanceUpdate,
  onTransactionsUpdate,
}: WithdrawTabProps) {
  // Lightning Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [showWithdrawQR, setShowWithdrawQR] = useState(false);

  // Mint Token state
  const [mintTokenAmount, setMintTokenAmount] = useState("");
  const [mintedToken, setMintedToken] = useState<string | null>(null);
  const [isMintingToken, setIsMintingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleWithdraw = async () => {
    if (!cashuWallet || !withdrawAmount || !withdrawAddress) return;

    const amount = parseInt(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Please enter a valid amount");
      return;
    }

    if (amount > balance) {
      setWithdrawError("Insufficient balance");
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(false);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Withdraw to Lightning address or invoice
      await wallet.lnPay({ pr: withdrawAddress });

      // Refresh balance and transactions
      await onBalanceUpdate();
      await onTransactionsUpdate();

      setWithdrawSuccess(true);
      setWithdrawAmount("");
      setWithdrawAddress("");
    } catch (error) {
      console.error("Failed to withdraw:", error);
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to withdraw"
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleMintToken = async () => {
    if (!cashuWallet || !mintTokenAmount) return;

    const amount = parseInt(mintTokenAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Please enter a valid amount");
      return;
    }

    if (amount > balance) {
      setWithdrawError("Insufficient balance");
      return;
    }

    setIsMintingToken(true);
    setWithdrawError(null);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get the primary mint for token creation
      const mintUrl =
        cashuConnection?.primaryMint || cashuConnection?.mints?.[0];
      if (!mintUrl) {
        throw new Error("No mint configured");
      }

      // Check if we have proofs for this mint
      const mintBalance = wallet.mintBalance(mintUrl);
      if (mintBalance < amount) {
        throw new Error(
          `Insufficient balance in ${mintUrl}. Available: ${mintBalance} sats`
        );
      }

      // Set the mint on the wallet
      // @ts-ignore - NDK wallet requires mint to be set
      wallet.mint = mintUrl;

      // Get the internal cashu-ts wallet for this mint
      // @ts-ignore - NDK internal method
      const cashuWalletInstance = await wallet.getCashuWallet(mintUrl);

      // Get available proofs for this mint from the wallet state
      // @ts-ignore - accessing wallet state
      const availableProofs =
        wallet.state?.getProofs({
          mint: mintUrl,
          onlyAvailable: true,
        }) || [];

      if (availableProofs.length === 0) {
        throw new Error("No available proofs to create token");
      }

      // Use the cashu-ts wallet directly to send/create token
      // This handles amount splitting automatically
      const { send: sendProofs, keep: keepProofs } =
        await cashuWalletInstance.send(amount, availableProofs);

      if (!sendProofs || sendProofs.length === 0) {
        throw new Error("Failed to create token proofs");
      }

      // Update the NDK wallet state to reflect the proofs being sent out
      // @ts-ignore - updating wallet state
      await wallet.state?.update(
        {
          destroy: availableProofs,
          store: keepProofs,
          mint: mintUrl,
        },
        "Token created"
      );

      // Encode as cashuA token
      const tokenObj = {
        token: [
          {
            mint: mintUrl,
            proofs: sendProofs,
          },
        ],
      };
      const encodedToken = `cashuA${btoa(JSON.stringify(tokenObj))}`;

      setMintedToken(encodedToken);

      // Refresh balance and transactions
      await onBalanceUpdate();
      await onTransactionsUpdate();
    } catch (error) {
      console.error("Failed to mint token:", error);
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to mint token"
      );
    } finally {
      setIsMintingToken(false);
    }
  };

  const handleWithdrawQRScan = (result: string) => {
    const cleaned = result.trim();
    const lowerResult = cleaned.toLowerCase();

    if (
      lowerResult.startsWith("lnbc") ||
      lowerResult.startsWith("lnurl") ||
      lowerResult.startsWith("lightning:")
    ) {
      // Remove lightning: prefix if present
      const invoice = cleaned.replace(/^lightning:/i, "");
      setWithdrawAddress(invoice);
      setShowWithdrawQR(false);
    } else {
      // Try to set it anyway in case it's a valid format we didn't recognize
      setWithdrawAddress(cleaned);
      setShowWithdrawQR(false);
    }
  };

  return (
    <div className="space-y-4 max-w-full">
      {/* Lightning Withdraw */}
      <div className="rounded-lg border border-border p-6 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ArrowUpFromLine className="w-5 h-5" />
            Withdraw Sats
          </h3>
          <p className="text-sm text-muted-foreground">
            Send sats from your Cashu wallet to a Lightning address or invoice
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="withdraw-amount">Amount (sats)</Label>
          <Input
            id="withdraw-amount"
            type="number"
            placeholder="1000"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Available: {formatAmount(balance)} sats
          </p>
        </div>

        {/* Quick Amount Buttons */}
        <div className="flex gap-2">
          {[1000, 5000, 10000].map((amt) => (
            <Button
              key={amt}
              variant="outline"
              size="sm"
              onClick={() => setWithdrawAmount(amt.toString())}
              disabled={amt > balance}
            >
              {formatAmount(amt)}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWithdrawAmount(balance.toString())}
          >
            Max
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="withdraw-address">Lightning Address or Invoice</Label>
          <div className="flex gap-2">
            <Input
              id="withdraw-address"
              type="text"
              placeholder="user@getalby.com or lnbc..."
              value={withdrawAddress}
              onChange={(e) => setWithdrawAddress(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowWithdrawQR(true)}
            >
              <Scan className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {withdrawError && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            {withdrawError}
          </div>
        )}

        {withdrawSuccess && (
          <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
            Withdrawal successful! Your sats are on the way.
          </div>
        )}

        <Button
          onClick={handleWithdraw}
          disabled={isWithdrawing || !withdrawAmount || !withdrawAddress}
          className="w-full"
        >
          {isWithdrawing ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <ArrowUpFromLine className="w-4 h-4 mr-2" />
              Withdraw{" "}
              {withdrawAmount ? formatAmount(parseInt(withdrawAmount)) : ""} sats
            </>
          )}
        </Button>

        {/* QR Scanner Modal for Lightning Invoice */}
        {showWithdrawQR && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg p-6 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Scan Lightning Invoice</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowWithdrawQR(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0 && result[0]?.rawValue) {
                    handleWithdrawQRScan(result[0].rawValue);
                  }
                }}
                styles={{
                  container: { width: "100%" },
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mint Cashu Token */}
      <div className="rounded-lg border border-border p-6 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Mint Cashu Token
          </h3>
          <p className="text-sm text-muted-foreground">
            Create a Cashu token from your wallet balance to share or use
            offline
          </p>
        </div>

        {!mintedToken ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="mint-amount">Amount (sats)</Label>
              <Input
                id="mint-amount"
                type="number"
                placeholder="1000"
                value={mintTokenAmount}
                onChange={(e) => setMintTokenAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatAmount(balance)} sats
              </p>
            </div>

            <div className="flex gap-2">
              {[1000, 5000, 10000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setMintTokenAmount(amt.toString())}
                  disabled={amt > balance}
                >
                  {formatAmount(amt)}
                </Button>
              ))}
            </div>

            <Button
              onClick={handleMintToken}
              disabled={isMintingToken || !mintTokenAmount}
              className="w-full"
            >
              {isMintingToken ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Minting...
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4 mr-2" />
                  Mint Token
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center p-6 bg-white rounded-lg">
              <QRCodeSVG value={mintedToken} size={256} level="M" />
            </div>

            <div className="space-y-2">
              <Label>Cashu Token</Label>
              <Textarea
                value={mintedToken}
                readOnly
                className="font-mono text-xs min-h-[100px] break-all"
              />
              <Button
                variant="outline"
                onClick={() => copyToClipboard(mintedToken)}
                className="w-full"
              >
                {copied ? (
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

            <div className="p-3 text-sm bg-blue-500/10 rounded-md border border-blue-500/20">
              <p className="text-blue-600 dark:text-blue-400">
                Share this token to send sats. The recipient can redeem it in
                any Cashu wallet.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setMintedToken(null);
                setMintTokenAmount("");
              }}
              className="w-full"
            >
              Mint New Token
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}