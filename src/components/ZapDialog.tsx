import { type NDKPaymentConfirmationLN } from "@nostr-dev-kit/ndk";
import {
  NDKEvent,
  NDKZapper,
  useNDK,
  useNDKCurrentUser,
} from "@nostr-dev-kit/react";
import { Check, Copy, ExternalLink, QrCode, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import React, { useEffect, useState } from "react";
import type { NDKStation } from "../lib/NDKStation";
import { useWalletStore } from "../stores/walletStore";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ZapIcon } from "./ui/icons/lucide-zap";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ZapState = "input" | "processing" | "invoice" | "success" | "error";

interface ZapDialogProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onZap?: (amount: number) => Promise<void>;
}

const ZAP_TIMEOUT_MS = 90000; // 90 seconds
const SUCCESS_AUTO_CLOSE_MS = 2000; // 2 seconds
const PRESET_AMOUNTS = [3, 7, 10, 21, 100, 500, 1000, 5000];

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
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [zapStartTime, setZapStartTime] = useState<number>(0);

  // Helper to handle successful zap
  const handleZapSuccess = (amountSats: number) => {
    setPaymentDetected(true);
    setWaitingForPayment(false);
    setZapReceipt(`Zapped ${amountSats} sats to ${station.name}`);
    setZapState("success");

    if (onZap) {
      onZap(amountSats);
    }

    setTimeout(() => onOpenChange(false), SUCCESS_AUTO_CLOSE_MS);
  };

  // Monitor for zap receipts after invoice is generated
  useEffect(() => {
    if (!ndk || !invoice || zapState !== "invoice") return;

    setWaitingForPayment(true);
    let isActive = true;
    let timeoutId: NodeJS.Timeout;

    // Subscribe to zap receipts for this addressable event
    const sub = ndk.subscribe(
      {
        kinds: [9735],
        "#a": [station.address],
        since: zapStartTime,
      },
      { closeOnEose: false }
    );

    sub.on("event", (zapEvent) => {
      if (!isActive) return;

      // Check if bolt11 matches our invoice
      const bolt11 = zapEvent.getMatchingTags("bolt11")[0]?.[1];
      const isMatch = bolt11 === invoice;

      // Accept if bolt11 matches, or if the #a tag filter matched (addressable event)
      if (isMatch || !bolt11) {
        isActive = false;
        clearTimeout(timeoutId);
        sub.stop();
        handleZapSuccess(parseInt(amount));
      }
    });

    // Timeout after 90 seconds
    timeoutId = setTimeout(() => {
      if (isActive) {
        setWaitingForPayment(false);
        isActive = false;
        sub.stop();
      }
    }, ZAP_TIMEOUT_MS);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      setTimeout(() => {
        try {
          sub.stop();
        } catch {}
      }, 10);
    };
  }, [ndk, invoice, zapState, station.address, zapStartTime, amount]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setZapState("input");
      setInvoice(null);
      setError(null);
      setZapReceipt(null);
      setCopied(false);
      setWaitingForPayment(false);
      setPaymentDetected(false);
      setZapStartTime(0);
    }
  }, [open]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Zap with NWC using the wallet already set on ndk.wallet
  const zapWithNWC = async (amountSats: number): Promise<boolean> => {
    if (!ndk) throw new Error("NDK not available");

    const wallet = getActiveWallet();
    if (!wallet?.lnPay) throw new Error("NWC wallet not available");

    // Create zapper - it will automatically use ndk.walletConfig.lnPay
    const zapper = new NDKZapper(station, amountSats * 1000, "msats", {
      comment,
      ndk, // Explicitly pass the NDK instance
    });

    // Set signer if available
    if (ndk.signer && !zapper.ndk.signer) {
      zapper.ndk.signer = ndk.signer;
    }

    const results = await zapper.zap();
    return results.size > 0;
  };

  const zapWithWebLN = async (amountSats: number): Promise<boolean> => {
    if (!ndk) throw new Error("NDK not available");
    if (typeof window === "undefined" || !(window as any).webln) {
      throw new Error("WebLN not available");
    }

    const webln = (window as any).webln;
    await webln.enable();

    // Create zapper with WebLN payment callback
    const zapper = new NDKZapper(station, amountSats * 1000, "msats", {
      comment,
      ndk,
      lnPay: async (payment: any) => {
        const result = await webln.sendPayment(payment.pr);
        return { preimage: result.preimage } as NDKPaymentConfirmationLN;
      },
    });

    // Set signer if available
    if (ndk.signer && !zapper.ndk.signer) {
      zapper.ndk.signer = ndk.signer;
    }

    const results = await zapper.zap();
    return results.size > 0;
  };

  // Fetch Lightning address from station owner's profile
  const fetchLightningAddress = async () => {
    if (!ndk) throw new Error("NDK not available");

    const stationUser = ndk.getUser({ pubkey: station.pubkey });
    await stationUser.fetchProfile();

    const lud16 = stationUser.profile?.lud16;
    const lud06 = stationUser.profile?.lud06;

    if (!lud06 && !lud16) {
      throw new Error(
        `Station owner (${station.name}) has no Lightning address configured`
      );
    }

    return { lud16, lud06 };
  };

  // Create a NIP-57 zap request event
  const createZapRequest = async (
    amountMsat: number,
    allowsNostr: boolean
  ): Promise<NDKEvent | null> => {
    if (!ndk?.signer || !allowsNostr) return null;

    const zapRequestEvent = new NDKEvent(ndk);
    zapRequestEvent.kind = 9734;
    zapRequestEvent.content = comment || "";
    zapRequestEvent.tags = [
      [
        "relays",
        ...Array.from(ndk.pool.connectedRelays()).map((r) => r.url),
      ].slice(0, 5),
      ["amount", amountMsat.toString()],
      ["p", station.pubkey],
      ["a", station.address],
    ];

    await zapRequestEvent.sign(ndk.signer);
    return zapRequestEvent;
  };

  // Generate invoice via LNURL
  const getInvoice = async (amountSats: number): Promise<string> => {
    const { lud16, lud06 } = await fetchLightningAddress();
    const amountMsat = amountSats * 1000;

    // Convert Lightning address to LNURL endpoint
    let lnurlEndpoint: string;
    if (lud16) {
      const [username, domain] = lud16.split("@");
      if (!username || !domain) {
        throw new Error("Invalid Lightning address format");
      }
      lnurlEndpoint = `https://${domain}/.well-known/lnurlp/${username}`;
    } else if (lud06) {
      throw new Error("lud06 decoding not implemented yet, please use lud16");
    } else {
      throw new Error("No Lightning address available");
    }

    // Fetch LNURL data
    const lnurlResponse = await fetch(lnurlEndpoint);
    if (!lnurlResponse.ok) {
      throw new Error(`LNURL endpoint returned ${lnurlResponse.status}`);
    }

    const lnurlData = await lnurlResponse.json();
    if (lnurlData.status === "ERROR") {
      throw new Error(lnurlData.reason || "LNURL endpoint returned error");
    }

    const { callback, minSendable, maxSendable } = lnurlData;
    if (!callback) throw new Error("No callback URL in LNURL response");

    // Validate amount
    if (minSendable && amountMsat < minSendable) {
      throw new Error(`Amount too low. Minimum: ${minSendable / 1000} sats`);
    }
    if (maxSendable && amountMsat > maxSendable) {
      throw new Error(`Amount too high. Maximum: ${maxSendable / 1000} sats`);
    }

    // Create zap request for NIP-57
    const zapRequestEvent = await createZapRequest(
      amountMsat,
      lnurlData.allowsNostr
    );

    // Request invoice
    const callbackUrl = new URL(callback);
    callbackUrl.searchParams.set("amount", amountMsat.toString());
    if (comment) {
      callbackUrl.searchParams.set("comment", comment);
    }
    if (zapRequestEvent) {
      callbackUrl.searchParams.set(
        "nostr",
        JSON.stringify(zapRequestEvent.rawEvent())
      );
    }

    const invoiceResponse = await fetch(callbackUrl.toString());
    if (!invoiceResponse.ok) {
      throw new Error(`Invoice callback returned ${invoiceResponse.status}`);
    }

    const invoiceData = await invoiceResponse.json();
    if (invoiceData.status === "ERROR") {
      throw new Error(invoiceData.reason || "Invoice generation failed");
    }

    const invoice = invoiceData.pr;
    if (!invoice) throw new Error("No invoice in response");

    return invoice;
  };

  // Generic handler for all zap methods
  const handleZap = async (
    zapMethod: (amount: number) => Promise<boolean>,
    errorMessage: string
  ) => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) return;

    setZapState("processing");
    setError(null);

    try {
      const success = await zapMethod(amountNum);
      if (success) {
        handleZapSuccess(amountNum);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage);
      setZapState("error");
    }
  };

  const handleZapWithNWC = () =>
    handleZap(zapWithNWC, "Failed to zap with NWC");
  const handleZapWithWebLN = () =>
    handleZap(zapWithWebLN, "Failed to zap with WebLN");

  const handleShowInvoice = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) return;

    setZapState("processing");
    setError(null);
    setZapStartTime(Math.floor(Date.now() / 1000));

    try {
      const inv = await getInvoice(amountNum);
      setInvoice(inv);
      setZapState("invoice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get invoice");
      setZapState("error");
    }
  };

  const handleManualPaymentConfirm = () => {
    handleZapSuccess(parseInt(amount));
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
                {PRESET_AMOUNTS.map((preset) => (
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

              {/* Payment status indicator */}
              {waitingForPayment && !paymentDetected && (
                <div className="mt-3 flex items-center gap-2 text-amber-600">
                  <div className="animate-spin h-4 w-4 border-2 border-amber-600 border-t-transparent rounded-full" />
                  <span className="text-sm font-medium">
                    Waiting for payment...
                  </span>
                </div>
              )}
              {paymentDetected && (
                <div className="mt-3 flex items-center gap-2 text-green-600">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">Payment detected!</span>
                </div>
              )}
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

            <div className="flex flex-col gap-2">
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

              <Button className="w-full" onClick={handleManualPaymentConfirm}>
                <Check className="w-4 h-4 mr-2" />
                I've Paid
              </Button>
            </div>
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
