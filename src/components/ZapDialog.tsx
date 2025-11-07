import React, { useState, useEffect } from "react";
import { useNDK, useNDKCurrentUser, NDKZapper } from "@nostr-dev-kit/react";
import { type NDKPaymentConfirmationLN } from "@nostr-dev-kit/ndk";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Zap, ExternalLink, QrCode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ZapIcon } from "./ui/icons/lucide-zap";
import type { NDKStation } from "../lib/NDKStation";
import { useWalletStore } from "../stores/walletStore";
import type { WebLNProvider } from "webln";

type ZapState = "input" | "processing" | "invoice" | "success" | "error";

interface ZapDialogProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onZap?: (amount: number) => Promise<void>;
}

export const ZapDialog: React.FC<ZapDialogProps> = ({
  station,
  open,
  onOpenChange,
  onZap,
}) => {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { getActiveWallet, nwcConnection } = useWalletStore();

  const [amount, setAmount] = useState("21");
  const [comment, setComment] = useState("");
  const [zapState, setZapState] = useState<ZapState>("input");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zapReceipt, setZapReceipt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presetAmounts = [21, 100, 500, 1000, 5000];

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setZapState("input");
      setInvoice(null);
      setError(null);
      setZapReceipt(null);
      setCopied(false);
    }
  }, [open]);

  // Check for WebLN support
  const checkWebLN = async (): Promise<WebLNProvider | null> => {
    if (typeof window !== "undefined" && (window as any).webln) {
      try {
        await (window as any).webln.enable();
        return (window as any).webln;
      } catch (err) {
        console.error("WebLN enable failed:", err);
        return null;
      }
    }
    return null;
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

  const zapWithNWC = async (amountSats: number): Promise<boolean> => {
    const wallet = getActiveWallet();
    if (!wallet || !ndk) {
      throw new Error("NWC wallet not available");
    }

    console.log("Zapping with NWC wallet...");

    // Get NDK signer (optional - will use anonymous zap if not available)
    const signer = ndk.signer;

    // Zap the station event directly (not the author)
    // NDKZapper can target events or users
    const zapperConfig: any = {
      comment,
      ndk,
      lnPay: async ({ pr }: { pr: string }) => {
        console.log("Paying invoice with NWC:", pr);
        if (!wallet.lnPay) {
          throw new Error("Wallet does not support Lightning payments");
        }

        const result = await wallet.lnPay({ pr } as any);
        return result as NDKPaymentConfirmationLN;
      },
    };

    // Add signer only if available (for authenticated zaps)
    if (signer) {
      zapperConfig.signer = signer;
    }

    const zapper = new NDKZapper(
      station,
      amountSats * 1000,
      "msat",
      zapperConfig
    );

    // Execute zap
    const results = await zapper.zap();
    console.log("Zap results:", results);

    return results.size > 0;
  };

  const zapWithWebLN = async (amountSats: number): Promise<boolean> => {
    const webln = await checkWebLN();
    if (!webln || !ndk) {
      throw new Error("WebLN not available");
    }

    console.log("Zapping with WebLN...");

    // Get NDK signer (optional - will use anonymous zap if not available)
    const signer = ndk.signer;

    // Create zapper instance
    const zapperConfig: any = {
      comment,
      ndk,
      lnPay: async ({ pr }: { pr: string }) => {
        console.log("Paying invoice with WebLN:", pr);
        const result = await webln.sendPayment(pr);
        return {
          preimage: result.preimage,
        } as NDKPaymentConfirmationLN;
      },
    };

    // Add signer only if available (for authenticated zaps)
    if (signer) {
      zapperConfig.signer = signer;
    }

    const zapper = new NDKZapper(
      station,
      amountSats * 1000,
      "msat",
      zapperConfig
    );

    // Execute zap
    const results = await zapper.zap();
    console.log("Zap results:", results);

    return results.size > 0;
  };

  const getInvoice = async (amountSats: number): Promise<string> => {
    if (!ndk) {
      throw new Error("NDK not available");
    }

    console.log("Getting invoice for station:", station);

    // Get NDK signer (optional - will create anonymous zap if not available)
    const signer = ndk.signer;

    return new Promise((resolve, reject) => {
      // Create zapper instance with lnPay callback to capture invoice
      const zapperConfig: any = {
        comment,
        ndk,
        lnPay: async ({ pr }: { pr: string }) => {
          console.log("Invoice received:", pr);
          // Resolve with the payment request (invoice)
          resolve(pr);
          // Return undefined to not actually pay
          return undefined as any;
        },
      };

      // Add signer only if available (for authenticated zaps)
      if (signer) {
        zapperConfig.signer = signer;
      }

      const zapper = new NDKZapper(
        station,
        amountSats * 1000,
        "msat",
        zapperConfig
      );

      // Trigger zap to generate invoice
      zapper.zap().catch(reject);

      // Timeout after 15 seconds
      setTimeout(() => reject(new Error("Invoice timeout")), 15000);
    });
  };

  const handleZapWithNWC = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) return;

    setZapState("processing");
    setError(null);

    try {
      const success = await zapWithNWC(amountNum);

      if (success) {
        setZapReceipt(`Zapped ${amountNum} sats to ${station.name}`);
        setZapState("success");

        if (onZap) {
          await onZap(amountNum);
        }

        setTimeout(() => {
          onOpenChange(false);
          setAmount("21");
          setComment("");
        }, 2000);
      }
    } catch (err) {
      console.error("Error zapping with NWC:", err);
      setError(err instanceof Error ? err.message : "Failed to zap with NWC");
      setZapState("error");
    }
  };

  const handleZapWithWebLN = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) return;

    setZapState("processing");
    setError(null);

    try {
      const success = await zapWithWebLN(amountNum);

      if (success) {
        setZapReceipt(`Zapped ${amountNum} sats to ${station.name}`);
        setZapState("success");

        if (onZap) {
          await onZap(amountNum);
        }

        setTimeout(() => {
          onOpenChange(false);
          setAmount("21");
          setComment("");
        }, 2000);
      }
    } catch (err) {
      console.error("Error zapping with WebLN:", err);
      setError(err instanceof Error ? err.message : "Failed to zap with WebLN");
      setZapState("error");
    }
  };

  const handleShowInvoice = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) return;

    setZapState("processing");
    setError(null);

    try {
      const inv = await getInvoice(amountNum);
      setInvoice(inv);
      setZapState("invoice");
    } catch (err) {
      console.error("Error getting invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to get invoice");
      setZapState("error");
    }
  };

  const isProcessing = zapState === "processing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="w-5 h-5 text-yellow-500" />
            Zap {station.name}
          </DialogTitle>
          <DialogDescription>
            Support this radio station with a lightning payment
          </DialogDescription>
        </DialogHeader>

        {/* Input State */}
        {zapState === "input" && (
          <div className="space-y-4 py-4">
            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (sats)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount in sats"
                min="1"
              />
            </div>

            {/* Preset Amounts */}
            <div className="space-y-2">
              <Label>Quick amounts</Label>
              <div className="flex flex-wrap gap-2">
                {presetAmounts.map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => setAmount(preset.toString())}
                    className={
                      amount === preset.toString()
                        ? "border-yellow-500 bg-yellow-50"
                        : ""
                    }
                  >
                    {preset.toLocaleString()} sats
                  </Button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Input
                id="comment"
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a message..."
              />
            </div>

            {/* Login Notice */}
            {!currentUser && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-semibold">Anonymous Zap</p>
                <p className="text-xs mt-1">
                  You're not logged in. Your zap will be anonymous. Log in to
                  zap with your identity.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Processing State */}
        {zapState === "processing" && (
          <div className="space-y-4 py-8">
            <div className="flex flex-col items-center justify-center">
              <Zap className="w-12 h-12 text-yellow-500 animate-pulse" />
              <p className="mt-4 text-lg font-semibold">Processing Zap...</p>
              <p className="text-sm text-muted-foreground">
                Sending {amount} sats to {station.name}
              </p>
            </div>
          </div>
        )}

        {/* Invoice State */}
        {zapState === "invoice" && invoice && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-lg border">
                <QRCodeSVG value={invoice} size={200} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Scan with your Lightning wallet
              </p>
            </div>

            <div className="space-y-2">
              <Label>Lightning Invoice</Label>
              <div className="flex gap-2">
                <Input value={invoice} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(invoice)}
                >
                  {copied ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                if (invoice.toLowerCase().startsWith("lightning:")) {
                  window.open(invoice, "_blank");
                } else {
                  window.open(`lightning:${invoice}`, "_blank");
                }
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Wallet
            </Button>
          </div>
        )}

        {/* Success State */}
        {zapState === "success" && (
          <div className="space-y-4 py-8">
            <div className="flex flex-col items-center justify-center">
              <div className="bg-green-100 rounded-full p-3">
                <Check className="w-12 h-12 text-green-600" />
              </div>
              <p className="mt-4 text-lg font-semibold">Zap Sent!</p>
              <p className="text-sm text-muted-foreground text-center">
                {zapReceipt}
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {zapState === "error" && (
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-semibold text-red-800">Zap Failed</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setZapState("input")}
            >
              Try Again
            </Button>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {zapState === "input" && (
            <div className="w-full space-y-2">
              {/* NWC Button - Show if we have NWC connection info */}
              {nwcConnection && (
                <Button
                  onClick={handleZapWithNWC}
                  disabled={!amount || parseInt(amount) <= 0 || isProcessing}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Zap with NWC Wallet
                </Button>
              )}

              {/* WebLN Button */}
              <Button
                onClick={handleZapWithWebLN}
                disabled={!amount || parseInt(amount) <= 0 || isProcessing}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Zap with WebLN
              </Button>

              {/* Invoice/QR Button */}
              <Button
                onClick={handleShowInvoice}
                disabled={!amount || parseInt(amount) <= 0 || isProcessing}
                variant="outline"
                className="w-full"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Show Invoice QR
              </Button>

              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="w-full mt-2"
              >
                Cancel
              </Button>
            </div>
          )}
          {zapState === "invoice" && (
            <Button
              variant="outline"
              onClick={() => setZapState("input")}
              className="w-full"
            >
              Back
            </Button>
          )}
          {zapState === "success" && (
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
