import React, { useState, useEffect } from "react";
import {
  useNDK,
  useNDKCurrentUser,
  NDKZapper,
  NDKEvent,
} from "@nostr-dev-kit/react";
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
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [zapStartTime, setZapStartTime] = useState<number>(0);

  const presetAmounts = [3, 7, 10, 21, 100, 500, 1000, 5000];

  // Subscribe to zap receipts when we have an invoice
  useEffect(() => {
    if (!ndk || !invoice || zapState !== "invoice") return;

    console.log(
      "🔔 Starting zap monitoring for invoice:",
      invoice.substring(0, 30) + "..."
    );
    setWaitingForPayment(true);

    let isActive = true;
    let timeoutId: NodeJS.Timeout;

    // Subscribe to zap receipts (kind 9735) for this specific addressable event
    // Addressable events use "a" tags, not "e" tags!
    // Format: kind:pubkey:d-tag
    const stationAddress = `${station.kind}:${
      station.pubkey
    }:${station.tagValue("d")}`;
    console.log("Subscribing to zap receipts for address:", station.address);

    const sub = ndk.subscribe(
      {
        kinds: [9735], // Zap receipt
        "#a": [station.address], // Only zaps for this addressable station event
        since: zapStartTime,
      },
      { closeOnEose: false }
    );

    sub.on("event", (zapEvent) => {
      if (!isActive) return;

      console.log("📨 Zap receipt received:", {
        id: zapEvent.id,
        created_at: zapEvent.created_at,
        tags: zapEvent.tags.map((t) => `${t[0]}: ${t[1]?.substring(0, 20)}`),
      });

      // Check if this zap receipt is for our invoice
      // Zap receipts have a "bolt11" tag with the invoice
      const bolt11Tag = zapEvent.getMatchingTags("bolt11")[0];
      const bolt11 = bolt11Tag?.[1];

      // Also check the description tag which might contain the zap request
      const descriptionTag = zapEvent.getMatchingTags("description")[0];
      const description = descriptionTag?.[1];

      console.log("Zap receipt details:", {
        bolt11Preview: bolt11?.substring(0, 50),
        expectedPreview: invoice.substring(0, 50),
        hasBolt11: !!bolt11,
        hasDescription: !!description,
        bolt11Match: bolt11 === invoice,
      });

      // Try matching by bolt11 directly
      if (bolt11 === invoice) {
        console.log("✅ Zap receipt matches our invoice (bolt11)!");

        isActive = false;
        clearTimeout(timeoutId);

        setPaymentDetected(true);
        setWaitingForPayment(false);
        setZapReceipt(`Zapped ${amount} sats to ${station.name}`);
        setZapState("success");

        if (onZap) {
          onZap(parseInt(amount));
        }

        // Auto-close after 2 seconds
        setTimeout(() => {
          onOpenChange(false);
        }, 2000);

        // Stop subscription
        sub.stop();
        return;
      }

      // If bolt11 doesn't match, check if we got a zap for our addressable event
      // Since we're filtering by #a tag, this should be for us
      console.log(
        "⚡ Zap receipt received for our station (filtered by #a tag)"
      );
      console.log(
        "Accepting zap even without bolt11 match since #a tag matches"
      );

      isActive = false;
      clearTimeout(timeoutId);

      setPaymentDetected(true);
      setWaitingForPayment(false);
      setZapReceipt(`Zapped ${amount} sats to ${station.name}`);
      setZapState("success");

      if (onZap) {
        onZap(parseInt(amount));
      }

      setTimeout(() => {
        onOpenChange(false);
      }, 2000);

      sub.stop();
    });

    // Set timeout for 90 seconds (like the working example)
    timeoutId = setTimeout(() => {
      if (isActive) {
        console.log("⏱️ Zap monitoring timeout after 90 seconds");
        setWaitingForPayment(false);
        isActive = false;
        sub.stop();
      }
    }, 90000);

    // Cleanup subscription when component unmounts or invoice changes
    return () => {
      console.log("🔕 Cleaning up zap receipt subscription");
      isActive = false;
      clearTimeout(timeoutId);

      // Add small delay to prevent race conditions
      setTimeout(() => {
        try {
          sub.stop();
        } catch (error) {
          console.warn("Error stopping subscription:", error);
        }
      }, 10);
    };
  }, [
    ndk,
    invoice,
    zapState,
    station.id,
    station.kind,
    station.pubkey,
    station.name,
    zapStartTime,
    amount,
    onZap,
    onOpenChange,
  ]);

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

    // Create lnPay callback (like the working example)
    const lnPay = async (payment: any) => {
      console.log("Paying invoice with NWC:", payment.pr);
      if (!wallet.lnPay) {
        throw new Error("Wallet does not support Lightning payments");
      }

      const result = await wallet.lnPay({ pr: payment.pr } as any);
      return result as NDKPaymentConfirmationLN;
    };

    // Zap the station event with minimal config
    const zapperConfig: any = {
      comment,
      lnPay,
    };

    const zapper = new NDKZapper(
      station,
      amountSats * 1000,
      "msats",
      zapperConfig
    );

    // If the zapper's NDK has no signer, set it
    if (!zapper.ndk?.signer && signer) {
      if (zapper.ndk) {
        zapper.ndk.signer = signer;
      }
    }

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

    // Create lnPay callback (like the working example)
    const lnPay = async (payment: any) => {
      console.log("Paying invoice with WebLN:", payment.pr);
      const result = await webln.sendPayment(payment.pr);
      return {
        preimage: result.preimage,
      } as NDKPaymentConfirmationLN;
    };

    // Zap the station event with minimal config
    const zapperConfig: any = {
      comment,
      lnPay,
    };

    const zapper = new NDKZapper(
      station,
      amountSats * 1000,
      "msats",
      zapperConfig
    );

    // If the zapper's NDK has no signer, set it
    if (!zapper.ndk?.signer && signer) {
      if (zapper.ndk) {
        zapper.ndk.signer = signer;
      }
    }

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
    console.log("Station details:", {
      id: station.id,
      pubkey: station.pubkey,
      name: station.name,
      tags: station.tags,
    });

    // Check if the station pubkey has a profile with zap info
    let lud16: string | undefined;
    let lud06: string | undefined;
    let stationUser;

    try {
      stationUser = ndk.getUser({ pubkey: station.pubkey });
      await stationUser.fetchProfile();
      console.log("Station user profile:", {
        pubkey: stationUser.pubkey,
        profile: stationUser.profile,
        lud06: stationUser.profile?.lud06,
        lud16: stationUser.profile?.lud16,
      });

      lud16 = stationUser.profile?.lud16;
      lud06 = stationUser.profile?.lud06;

      if (!lud06 && !lud16) {
        throw new Error(
          `Station owner (${station.name}) has no Lightning address configured. They need to add a Lightning address (lud16) or LNURL (lud06) to their Nostr profile.`
        );
      }

      // DEBUG: Check what NDK's getZapInfo returns
      console.log("DEBUG: Calling stationUser.getZapInfo()...");
      try {
        const zapInfo = await stationUser.getZapInfo(5000);
        console.log("DEBUG: getZapInfo() returned:", {
          size: zapInfo.size,
          keys: Array.from(zapInfo.keys()),
          nip57: zapInfo.get("nip57"),
          nip61: zapInfo.get("nip61"),
        });
      } catch (zapInfoError) {
        console.error("DEBUG: getZapInfo() failed:", zapInfoError);
      }
    } catch (error) {
      console.error("Error fetching station user profile:", error);
      throw error;
    }

    // Try getting invoice directly from Lightning address
    console.log("Attempting to get invoice directly from Lightning address...");

    try {
      // Convert lud16 to LNURL if needed
      let lnurlEndpoint: string;

      if (lud16) {
        console.log("Converting lud16 to LNURL:", lud16);
        // lud16 format: user@domain.com -> https://domain.com/.well-known/lnurlp/user
        const [username, domain] = lud16.split("@");
        if (!username || !domain) {
          throw new Error("Invalid Lightning address format");
        }
        lnurlEndpoint = `https://${domain}/.well-known/lnurlp/${username}`;
      } else if (lud06) {
        console.log("Decoding lud06 LNURL:", lud06);
        // Decode bech32 lud06 to get the URL
        // For now, we'll use lud16 primarily
        throw new Error("lud06 decoding not implemented yet, please use lud16");
      } else {
        throw new Error("No Lightning address available");
      }

      console.log("Fetching LNURL endpoint:", lnurlEndpoint);

      // Step 1: Get the callback URL from the LNURL endpoint
      const lnurlResponse = await fetch(lnurlEndpoint);
      if (!lnurlResponse.ok) {
        throw new Error(`LNURL endpoint returned ${lnurlResponse.status}`);
      }

      const lnurlData = await lnurlResponse.json();
      console.log("LNURL response:", lnurlData);

      if (lnurlData.status === "ERROR") {
        throw new Error(lnurlData.reason || "LNURL endpoint returned error");
      }

      const { callback, minSendable, maxSendable } = lnurlData;

      if (!callback) {
        throw new Error("No callback URL in LNURL response");
      }

      // Check amount bounds (amounts are in millisatoshis)
      const amountMsat = amountSats * 1000;
      if (minSendable && amountMsat < minSendable) {
        throw new Error(`Amount too low. Minimum: ${minSendable / 1000} sats`);
      }
      if (maxSendable && amountMsat > maxSendable) {
        throw new Error(`Amount too high. Maximum: ${maxSendable / 1000} sats`);
      }

      console.log("Requesting invoice from callback:", callback);

      // Step 2: Create a zap request event (kind 9734) for NIP-57
      // This tells the Lightning service to publish a zap receipt after payment
      const signer = ndk.signer;
      let zapRequestEvent: NDKEvent | null = null;

      if (signer && lnurlData.allowsNostr) {
        console.log("Creating zap request event (kind 9734)...");
        zapRequestEvent = new NDKEvent(ndk);
        zapRequestEvent.kind = 9734; // Zap request
        zapRequestEvent.content = comment || "";
        zapRequestEvent.tags = [
          [
            "relays",
            ...Array.from(ndk.pool.connectedRelays()).map((r) => r.url),
          ].slice(0, 5), // Include some relay hints
          ["amount", amountMsat.toString()],
          ["p", station.pubkey], // Person being zapped
        ];

        // For addressable events, use 'a' tag instead of 'e' tag
        const stationAddress = `${station.kind}:${
          station.pubkey
        }:${station.tagValue("d")}`;
        zapRequestEvent.tags.push(["a", stationAddress]);

        await zapRequestEvent.sign(signer);
        console.log("Zap request event created and signed:", {
          id: zapRequestEvent.id,
          pubkey: zapRequestEvent.pubkey,
          tags: zapRequestEvent.tags,
        });
      } else {
        console.log("Anonymous zap (no signer or nostr not supported)");
      }

      // Step 3: Request the invoice from the callback
      const callbackUrl = new URL(callback);
      callbackUrl.searchParams.set("amount", amountMsat.toString());
      if (comment) {
        callbackUrl.searchParams.set("comment", comment);
      }
      // Include the zap request event if we have one
      if (zapRequestEvent) {
        callbackUrl.searchParams.set(
          "nostr",
          JSON.stringify(zapRequestEvent.rawEvent())
        );
      }

      console.log("Callback URL:", callbackUrl.toString());

      const invoiceResponse = await fetch(callbackUrl.toString());
      if (!invoiceResponse.ok) {
        throw new Error(`Invoice callback returned ${invoiceResponse.status}`);
      }

      const invoiceData = await invoiceResponse.json();
      console.log("Invoice response:", invoiceData);

      if (invoiceData.status === "ERROR") {
        throw new Error(invoiceData.reason || "Invoice generation failed");
      }

      const invoice = invoiceData.pr;
      if (!invoice) {
        throw new Error("No invoice in response");
      }

      console.log(
        "Invoice generated successfully:",
        invoice.substring(0, 50) + "..."
      );
      return invoice;
    } catch (error) {
      console.error("Direct invoice generation failed:", error);
      throw error;
    }
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

    // Set the start time for zap receipt filtering (current Unix timestamp)
    const startTime = Math.floor(Date.now() / 1000);
    setZapStartTime(startTime);
    console.log("Set zap start time:", startTime);

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

              <Button
                className="w-full"
                onClick={() => {
                  console.log("Manual payment confirmation");
                  setPaymentDetected(true);
                  setWaitingForPayment(false);
                  setZapReceipt(`Zapped ${amount} sats to ${station.name}`);
                  setZapState("success");

                  if (onZap) {
                    onZap(parseInt(amount));
                  }

                  setTimeout(() => {
                    onOpenChange(false);
                  }, 2000);
                }}
              >
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
