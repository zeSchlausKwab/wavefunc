import { useState } from "react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { QRCodeSVG } from "qrcode.react";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  ArrowDownToLine,
  Coins,
  Copy,
  Check,
  QrCode,
  RefreshCw,
  Scan,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

interface DepositTabProps {
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

export function DepositTab({
  cashuWallet,
  balance,
  cashuConnection,
  onBalanceUpdate,
  onTransactionsUpdate,
}: DepositTabProps) {
  // Lightning Invoice Deposit state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositInvoice, setDepositInvoice] = useState<string | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [depositBalanceSnapshot, setDepositBalanceSnapshot] =
    useState<number>(0);

  // Cashu Token Redemption state
  const [cashuTokenInput, setCashuTokenInput] = useState("");
  const [isRedeemingToken, setIsRedeemingToken] = useState(false);
  const [redeemTokenSuccess, setRedeemTokenSuccess] = useState(false);
  const [showDepositQR, setShowDepositQR] = useState(false);

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

  const handleGenerateInvoice = async () => {
    if (!cashuWallet || !depositAmount) return;

    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError("Please enter a valid amount");
      return;
    }

    setIsGeneratingInvoice(true);
    setDepositError(null);
    setDepositSuccess(false);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get the primary mint
      const depositMint =
        cashuConnection?.primaryMint || cashuConnection?.mints?.[0];
      if (!depositMint) {
        throw new Error("No mints configured");
      }

      // Capture current balance to detect changes
      setDepositBalanceSnapshot(balance);

      // Generate deposit invoice using the primary mint
      const deposit = wallet.deposit(amount, depositMint);

      // Start the deposit and get the invoice
      const invoice = await deposit.start();
      setDepositInvoice(invoice);

      // Listen for success
      deposit.on("success", async () => {
        await onBalanceUpdate();
        await onTransactionsUpdate();
        setDepositSuccess(true);
        setDepositError(null);

        // Auto-clear success message and reset after a few seconds
        setTimeout(() => {
          setDepositSuccess(false);
          setDepositInvoice(null);
          setDepositAmount("");
          setDepositBalanceSnapshot(0);
        }, 5000);
      });

      deposit.on("error", (error) => {
        setDepositError(error);
      });
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      setDepositError(
        error instanceof Error ? error.message : "Failed to generate invoice"
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleRedeemToken = async () => {
    if (!cashuWallet || !cashuTokenInput.trim()) return;

    setIsRedeemingToken(true);
    setDepositError(null);

    try {
      const wallet = cashuWallet as NDKCashuWallet;
      const token = cashuTokenInput.trim();

      // Receive the token - this will add the sats to the wallet
      const result = await wallet.receiveToken(token, "Deposited via QR/paste");

      if (!result) {
        throw new Error("Failed to receive token");
      }

      // Refresh balance and transactions
      await onBalanceUpdate();
      await onTransactionsUpdate();

      setCashuTokenInput("");
      setDepositError(null);
      setRedeemTokenSuccess(true);

      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        setRedeemTokenSuccess(false);
      }, 3000);
    } catch (error) {
      console.error("Failed to redeem token:", error);
      setDepositError(
        error instanceof Error ? error.message : "Failed to redeem token"
      );
    } finally {
      setIsRedeemingToken(false);
    }
  };

  const handleDepositQRScan = (result: string) => {
    // Check if it's a Cashu token
    if (result.startsWith("cashuA") || result.includes("cashu")) {
      setCashuTokenInput(result);
      setShowDepositQR(false);
    }
  };

  return (
    <div className="space-y-4 max-w-full">
      {/* Lightning Invoice Deposit */}
      <div className="rounded-lg border border-border p-2 md:p-4 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5" />
            Deposit via Lightning
          </h3>
          <p className="text-sm text-muted-foreground">
            Generate a Lightning invoice to deposit sats into your Cashu wallet
          </p>
        </div>

        {!depositInvoice ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="deposit-amount">Amount (sats)</Label>
              <Input
                id="deposit-amount"
                type="number"
                placeholder="1000"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2">
              {[1000, 5000, 10000, 50000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setDepositAmount(amt.toString())}
                >
                  {formatAmount(amt)}
                </Button>
              ))}
            </div>

            {depositError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {depositError}
              </div>
            )}

            <Button
              onClick={handleGenerateInvoice}
              disabled={isGeneratingInvoice || !depositAmount}
              className="w-full"
            >
              {isGeneratingInvoice ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating Invoice...
                </>
              ) : (
                <>
                  <QrCode className="w-4 h-4 mr-2" />
                  Generate Invoice
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            {!depositSuccess ? (
              <>
                <div className="flex justify-center p-2 md:p-4 bg-white rounded-lg">
                  <QRCodeSVG value={depositInvoice} size={256} level="M" />
                </div>

                <div className="space-y-2">
                  <Label>Lightning Invoice</Label>
                  <div className="flex gap-2 max-w-full overflow-hidden">
                    <Input
                      value={depositInvoice}
                      readOnly
                      className="font-mono text-xs break-all min-w-0 flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => copyToClipboard(depositInvoice)}
                    >
                      {copied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="p-3 text-sm bg-blue-500/10 rounded-md border border-blue-500/20">
                  <p className="text-blue-600 dark:text-blue-400">
                    Scan this QR code or copy the invoice to pay with any
                    Lightning wallet. Waiting for payment...
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setDepositInvoice(null);
                    setDepositAmount("");
                    setDepositBalanceSnapshot(0);
                  }}
                  className="w-full"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center justify-center p-12 space-y-4">
                  <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="w-12 h-12 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-green-600">
                    Payment Received!
                  </h3>
                  <p className="text-muted-foreground text-center">
                    Your deposit of {depositAmount} sats has been added to your
                    wallet
                  </p>
                </div>

                <div className="p-4 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="w-4 h-4" />
                    <span className="font-semibold">
                      Transaction Successful
                    </span>
                  </div>
                  <p className="text-xs">
                    New balance: {formatAmount(balance)} sats
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cashu Token Redemption */}
      <div className="rounded-lg border border-border p-2 md:p-4 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Redeem Cashu Token
          </h3>
          <p className="text-sm text-muted-foreground">
            Paste or scan a Cashu token to add sats to your wallet
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cashu-token">Cashu Token</Label>
          <Textarea
            id="cashu-token"
            placeholder="cashuA..."
            value={cashuTokenInput}
            onChange={(e) => setCashuTokenInput(e.target.value)}
            className="font-mono text-xs min-h-[100px] break-all"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDepositQR(true)}
            className="flex-1"
          >
            <Scan className="w-4 h-4 mr-2" />
            Scan QR Code
          </Button>
          <Button
            onClick={handleRedeemToken}
            disabled={isRedeemingToken || !cashuTokenInput.trim()}
            className="flex-1"
          >
            {isRedeemingToken ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Redeeming...
              </>
            ) : (
              <>
                <Coins className="w-4 h-4 mr-2" />
                Redeem Token
              </>
            )}
          </Button>
        </div>

        {redeemTokenSuccess && (
          <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span className="font-semibold">
                Token Redeemed Successfully!
              </span>
            </div>
            <p className="text-xs mt-1">
              Sats have been added to your wallet. New balance:{" "}
              {formatAmount(balance)} sats
            </p>
          </div>
        )}

        {/* QR Scanner Modal */}
        {showDepositQR && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background rounded-lg p-2 md:p-4 max-w-md w-full space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Scan Cashu Token</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDepositQR(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Scanner
                onScan={(result) => {
                  if (result && result.length > 0 && result[0]?.rawValue) {
                    handleDepositQRScan(result[0].rawValue);
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
    </div>
  );
}
