// Fully Applesauce-native zap flow.
// Replaces the previous NDKZapper-based implementation per the migration
// rules in docs/APPLESAUCE_REFACTOR_STATUS.md.
//
// NWC payment goes through `src/lib/nostr/nwc.ts` which speaks NIP-47
// directly over the runtime RelayPool — no NDK wallet stack involvement.

import { EventFactory } from "applesauce-core";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { Check, Copy, ExternalLink, QrCode, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import React, { useEffect, useState } from "react";
import { getPublicContentRelayUrls } from "../config/nostr";
import { getAddressableIdentity, getFirstTagValue } from "../lib/nostr/domain";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { nwcPayInvoice, parseNWCConnectionString } from "../lib/nostr/nwc";
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

type StationLike = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags" | "content"> & {
  name?: string;
};

interface ZapDialogProps {
  station: StationLike;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onZap?: (amount: number) => Promise<void>;
}

const ZAP_TIMEOUT_MS = 90000;
const SUCCESS_AUTO_CLOSE_MS = 2000;
const PRESET_AMOUNTS = [3, 7, 10, 21, 100, 500, 1000, 5000];

declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      sendPayment(invoice: string): Promise<{ preimage: string }>;
    };
  }
}

export const ZapDialog: React.FC<ZapDialogProps> = ({
  station,
  open,
  onOpenChange,
  onZap,
}) => {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool, signer, readRelays } = useWavefuncNostr();
  const { nwcConnection } = useWalletStore();

  const stationAddress =
    getAddressableIdentity(station) ?? `${station.kind}:${station.pubkey}`;
  const stationName =
    station.name ?? getFirstTagValue(station, "name") ?? "Station";

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

  // ── Resolve recipient profile (lud16/lud06) via the applesauce event store ──
  const ownerProfile = use$(
    () => eventStore.profile(station.pubkey),
    [eventStore, station.pubkey],
  );

  // Trigger a profile fetch on open if the store doesn't have it yet
  useEffect(() => {
    if (!open || ownerProfile) return;
    const sub = relayPool
      .subscription(readRelays, [
        { kinds: [0], authors: [station.pubkey], limit: 1 },
      ])
      .pipe(storeEvents(eventStore))
      .subscribe();
    return () => sub.unsubscribe();
  }, [open, ownerProfile, relayPool, eventStore, readRelays, station.pubkey]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const handleZapSuccess = (amountSats: number) => {
    setPaymentDetected(true);
    setWaitingForPayment(false);
    setZapReceipt(`Zapped ${amountSats} sats to ${stationName}`);
    setZapState("success");
    onZap?.(amountSats);
    setTimeout(() => onOpenChange(false), SUCCESS_AUTO_CLOSE_MS);
  };

  const fetchLightningAddress = (): { lud16?: string; lud06?: string } => {
    if (!ownerProfile?.lud16 && !ownerProfile?.lud06) {
      throw new Error(
        `Station owner (${stationName}) has no Lightning address configured`,
      );
    }
    return { lud16: ownerProfile.lud16, lud06: ownerProfile.lud06 };
  };

  // Public, externally reachable relays the LNURL endpoint can publish the
  // zap receipt to. We can't use writeRelays directly because in dev that's
  // just localhost — and an external LNURL service can't reach our laptop.
  const zapReceiptRelays = getPublicContentRelayUrls().slice(0, 5);

  // Build and sign a NIP-57 zap request (kind 9734)
  const buildZapRequest = async (
    amountMsat: number,
    allowsNostr: boolean,
  ): Promise<NostrEvent | null> => {
    if (!signer || !allowsNostr) return null;

    const template: EventTemplate = {
      kind: 9734,
      content: comment || "",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["relays", ...zapReceiptRelays],
        ["amount", amountMsat.toString()],
        ["p", station.pubkey],
        ["a", stationAddress],
      ],
    };

    const factory = new EventFactory({ signer });
    const draft = await factory.build(template);
    return await factory.sign(draft);
  };

  // Generate invoice via LNURL
  const getInvoice = async (amountSats: number): Promise<string> => {
    const { lud16, lud06 } = fetchLightningAddress();
    const amountMsat = amountSats * 1000;

    let lnurlEndpoint: string;
    if (lud16) {
      const [username, domain] = lud16.split("@");
      if (!username || !domain) throw new Error("Invalid Lightning address format");
      lnurlEndpoint = `https://${domain}/.well-known/lnurlp/${username}`;
    } else if (lud06) {
      throw new Error("lud06 decoding not implemented yet, please use lud16");
    } else {
      throw new Error("No Lightning address available");
    }

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

    if (minSendable && amountMsat < minSendable) {
      throw new Error(`Amount too low. Minimum: ${minSendable / 1000} sats`);
    }
    if (maxSendable && amountMsat > maxSendable) {
      throw new Error(`Amount too high. Maximum: ${maxSendable / 1000} sats`);
    }

    const zapRequest = await buildZapRequest(amountMsat, lnurlData.allowsNostr);

    const callbackUrl = new URL(callback);
    callbackUrl.searchParams.set("amount", amountMsat.toString());
    if (comment) {
      callbackUrl.searchParams.set("comment", comment);
    }
    if (zapRequest) {
      callbackUrl.searchParams.set("nostr", JSON.stringify(zapRequest));
    }

    const invoiceResponse = await fetch(callbackUrl.toString());
    if (!invoiceResponse.ok) {
      throw new Error(`Invoice callback returned ${invoiceResponse.status}`);
    }

    const invoiceData = await invoiceResponse.json();
    if (invoiceData.status === "ERROR") {
      throw new Error(invoiceData.reason || "Invoice generation failed");
    }

    if (!invoiceData.pr) throw new Error("No invoice in response");
    return invoiceData.pr;
  };

  // ── Payment paths ──────────────────────────────────────────────────────────

  const zapWithNWC = async (amountSats: number): Promise<boolean> => {
    if (!nwcConnection?.connectionString) {
      throw new Error("NWC wallet not connected");
    }

    const inv = await getInvoice(amountSats);
    setInvoice(inv);
    setZapStartTime(Math.floor(Date.now() / 1000));

    const connection = parseNWCConnectionString(nwcConnection.connectionString);
    const result = await nwcPayInvoice(connection, inv, relayPool);
    return Boolean(result.preimage);
  };

  const zapWithWebLN = async (amountSats: number): Promise<boolean> => {
    if (typeof window === "undefined" || !window.webln) {
      throw new Error("WebLN not available");
    }
    const webln = window.webln;
    await webln.enable();

    const inv = await getInvoice(amountSats);
    setInvoice(inv);
    setZapStartTime(Math.floor(Date.now() / 1000));

    const result = await webln.sendPayment(inv);
    return Boolean(result?.preimage);
  };

  // ── Zap receipt monitoring ─────────────────────────────────────────────────

  useEffect(() => {
    if (!invoice || zapState !== "invoice") return;

    setWaitingForPayment(true);
    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Listen on the union of (relays we advertised in the zap request) and
    // (our configured read relays). The LNURL endpoint will publish the
    // receipt to the advertised relays; including readRelays gives us a
    // little extra coverage in case the wallet republishes elsewhere.
    const receiptRelays = Array.from(
      new Set([...zapReceiptRelays, ...readRelays]),
    );

    const sub = relayPool
      .subscription(receiptRelays, [
        {
          kinds: [9735],
          "#a": [stationAddress],
          since: zapStartTime,
        },
      ])
      .subscribe({
        next: (message) => {
          if (!isActive || message === "EOSE") return;
          const zapEvent = message as NostrEvent;
          const bolt11 = zapEvent.tags.find((t) => t[0] === "bolt11")?.[1];
          if (!bolt11 || bolt11 === invoice) {
            isActive = false;
            clearTimeout(timeoutId);
            sub.unsubscribe();
            handleZapSuccess(parseInt(amount, 10));
          }
        },
      });

    timeoutId = setTimeout(() => {
      if (isActive) {
        setWaitingForPayment(false);
        isActive = false;
        sub.unsubscribe();
      }
    }, ZAP_TIMEOUT_MS);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      sub.unsubscribe();
    };
  }, [invoice, zapState, stationAddress, zapStartTime, amount, relayPool]);

  // ── State reset on close ────────────────────────────────────────────────────

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

  // ── Zap action wrappers ────────────────────────────────────────────────────

  const handleZap = async (
    zapMethod: (amount: number) => Promise<boolean>,
    errorMessage: string,
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

  const handleZapWithNWC = () => handleZap(zapWithNWC, "Failed to zap with NWC");
  const handleZapWithWebLN = () => handleZap(zapWithWebLN, "Failed to zap with WebLN");

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
    handleZapSuccess(parseInt(amount, 10));
  };

  const isProcessing = zapState === "processing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="w-5 h-5 text-yellow-500" />
            Zap {stationName}
          </DialogTitle>
          <DialogDescription>
            Support this radio station with a lightning payment
          </DialogDescription>
        </DialogHeader>

        {zapState === "input" && (
          <div className="space-y-4 py-4">
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

        {zapState === "processing" && (
          <div className="space-y-4 py-8">
            <div className="flex flex-col items-center justify-center">
              <Zap className="w-12 h-12 text-yellow-500 animate-pulse" />
              <p className="mt-4 text-lg font-semibold">Processing Zap...</p>
              <p className="text-sm text-muted-foreground">
                Sending {amount} sats to {stationName}
              </p>
            </div>
          </div>
        )}

        {zapState === "invoice" && invoice && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-lg border">
                <QRCodeSVG value={invoice} size={200} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Scan with your Lightning wallet
              </p>

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
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
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

              <Button
                onClick={handleZapWithWebLN}
                disabled={!amount || parseInt(amount) <= 0 || isProcessing}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Zap with WebLN
              </Button>

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
