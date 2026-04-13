import { useCallback, useEffect, useMemo, useState } from "react";
import { EventFactory } from "applesauce-core";
import type { EventTemplate, NostrEvent } from "applesauce-core/helpers/event";
import { ProfileModel } from "applesauce-core/models";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { getPublicContentRelayUrls } from "../config/nostr";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useNWCConnectionStore } from "../stores/nwcConnectionStore";
import { nwcPayInvoice, parseNWCConnectionString } from "../lib/nostr/nwc";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { QRCode } from "./QRCode";

const SUPPORT_PUBKEY = "3aa5817273c3b2f94f491840e0472f049d0f10009e23de63006166bca9b36ea3";
const AMOUNTS = [1000, 5000, 10000, 21000];

declare global {
  interface Window {
    webln?: {
      enable(): Promise<void>;
      sendPayment(invoice: string): Promise<{ preimage: string }>;
    };
  }
}

function formatSats(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

type SupportState = "input" | "processing" | "invoice" | "success" | "error";

export function SupportPopover() {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool, accounts, readRelays } = useWavefuncNostr();
  const nwcConnection = useNWCConnectionStore((s) => s.connection);
  const signer = accounts.active?.signer ?? null;

  const profile = useEventModel(ProfileModel, [SUPPORT_PUBKEY]);
  const [amount, setAmount] = useState(5000);
  const [comment, setComment] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<SupportState>("input");
  const [zapStartTime, setZapStartTime] = useState(0);
  const [open, setOpen] = useState(false);

  const lud16 = profile?.lud16;
  const zapReceiptRelays = useMemo(() => getPublicContentRelayUrls().slice(0, 5), []);

  // Fetch profile on open
  useEffect(() => {
    if (!open) return;
    const sub = relayPool
      .subscription(readRelays, [
        { kinds: [0], authors: [SUPPORT_PUBKEY], limit: 1 },
      ])
      .pipe(storeEvents(eventStore))
      .subscribe();
    return () => sub.unsubscribe();
  }, [open, relayPool, eventStore, readRelays]);

  // Monitor for zap receipt (kind 9735)
  useEffect(() => {
    if (!invoice || state !== "invoice") return;
    const sub = relayPool
      .subscription(zapReceiptRelays, [
        { kinds: [9735], "#p": [SUPPORT_PUBKEY], since: zapStartTime },
      ])
      .subscribe({
        next: (message) => {
          if (message === "EOSE") return;
          const event = message as NostrEvent;
          const bolt11 = event.tags.find((t) => t[0] === "bolt11")?.[1];
          if (bolt11 === invoice) {
            setState("success");
          }
        },
      });
    return () => sub.unsubscribe();
  }, [invoice, state, zapStartTime, relayPool, zapReceiptRelays]);

  // Build NIP-57 zap request (kind 9734)
  const buildZapRequest = useCallback(async (
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
        ["p", SUPPORT_PUBKEY],
      ],
    };
    const factory = new EventFactory({ signer });
    const draft = await factory.build(template);
    return await factory.sign(draft);
  }, [signer, comment, zapReceiptRelays]);

  // Fetch invoice via LNURL (with optional zap request)
  const getInvoice = useCallback(async (sats: number): Promise<string> => {
    if (!lud16) throw new Error("No lightning address");
    const [username, domain] = lud16.split("@");
    if (!username || !domain) throw new Error("Invalid lightning address");

    const amountMsat = sats * 1000;
    const endpoint = `https://${domain}/.well-known/lnurlp/${username}`;
    const res = await fetch(endpoint);
    const data = await res.json();
    if (data.status === "ERROR") throw new Error(data.reason);

    const { callback, minSendable, maxSendable } = data;
    if (minSendable && amountMsat < minSendable) throw new Error(`Min: ${minSendable / 1000} sats`);
    if (maxSendable && amountMsat > maxSendable) throw new Error(`Max: ${maxSendable / 1000} sats`);

    const zapRequest = await buildZapRequest(amountMsat, data.allowsNostr);

    const callbackUrl = new URL(callback);
    callbackUrl.searchParams.set("amount", amountMsat.toString());
    if (comment) callbackUrl.searchParams.set("comment", comment);
    if (zapRequest) callbackUrl.searchParams.set("nostr", JSON.stringify(zapRequest));

    const invoiceRes = await fetch(callbackUrl.toString());
    const invoiceData = await invoiceRes.json();
    if (!invoiceData.pr) throw new Error("No invoice returned");
    return invoiceData.pr;
  }, [lud16, comment, buildZapRequest]);

  // Payment: show QR (manual pay)
  const handleGetInvoice = async () => {
    setLoading(true);
    setError(null);
    try {
      const inv = await getInvoice(amount);
      setInvoice(inv);
      setZapStartTime(Math.floor(Date.now() / 1000));
      setState("invoice");
    } catch (err: any) {
      setError(err.message || "Failed to fetch invoice");
    } finally {
      setLoading(false);
    }
  };

  // Payment: WebLN (browser extension)
  const handleWebLN = async () => {
    if (!window.webln) return;
    setLoading(true);
    setError(null);
    try {
      await window.webln.enable();
      const inv = await getInvoice(amount);
      setInvoice(inv);
      setZapStartTime(Math.floor(Date.now() / 1000));
      setState("processing");
      const result = await window.webln.sendPayment(inv);
      if (result.preimage) setState("success");
    } catch (err: any) {
      setError(err.message || "WebLN payment failed");
      if (invoice) setState("invoice"); // fall back to QR
    } finally {
      setLoading(false);
    }
  };

  // Payment: NWC (Nostr Wallet Connect)
  const handleNWC = async () => {
    if (!nwcConnection?.connectionString) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await getInvoice(amount);
      setInvoice(inv);
      setZapStartTime(Math.floor(Date.now() / 1000));
      setState("processing");
      const connection = parseNWCConnectionString(nwcConnection.connectionString);
      const result = await nwcPayInvoice(connection, inv, relayPool);
      if (result.preimage) setState("success");
    } catch (err: any) {
      setError(err.message || "NWC payment failed");
      if (invoice) setState("invoice");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setInvoice(null);
    setError(null);
    setCopied(false);
    setComment("");
    setState("input");
    setLoading(false);
  };

  const hasWebLN = typeof window !== "undefined" && !!window.webln;
  const hasNWC = !!nwcConnection?.connectionString;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 font-bold tracking-tighter uppercase text-on-background px-2.5 lg:px-3 py-1 hover:skew-x-6 transition-transform hover:bg-secondary-fixed-dim whitespace-nowrap"
          title="Support WaveFunc"
        >
          <span className="material-symbols-outlined text-[18px]">volunteer_activism</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="p-4 border-b-2 border-on-background">
          <div className="flex items-center gap-3">
            {profile?.picture ? (
              <img src={profile.picture} alt="" className="w-10 h-10 border-2 border-on-background object-cover" />
            ) : (
              <div className="w-10 h-10 border-2 border-on-background bg-on-background/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px] text-on-background/30">person</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-black uppercase tracking-tight font-headline truncate">
                {profile?.name || "WAVEFUNC"}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
                SUPPORT_THE_PROJECT
              </div>
            </div>
          </div>
        </div>

        {/* Success */}
        {state === "success" && (
          <div className="p-6 text-center space-y-3">
            <span className="material-symbols-outlined text-5xl text-primary">bolt</span>
            <div className="text-lg font-black uppercase tracking-tight font-headline">
              ZAP_SENT
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
              {formatSats(amount)} SATS — THANK_YOU
            </div>
          </div>
        )}

        {/* Processing */}
        {state === "processing" && (
          <div className="p-6 text-center space-y-3">
            <span className="inline-block w-8 h-8 border-4 border-on-background/20 border-t-primary animate-spin" />
            <div className="text-sm font-black uppercase tracking-tight">PROCESSING_PAYMENT...</div>
          </div>
        )}

        {/* Input */}
        {state === "input" && (
          <div className="p-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
              SELECT_AMOUNT (SATS)
            </div>
            <div className="grid grid-cols-4 gap-2">
              {AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(a)}
                  className={`py-2 text-xs font-black uppercase tracking-tight border-2 border-on-background transition-colors ${
                    amount === a ? "bg-on-background text-surface" : "bg-surface hover:bg-on-background/10"
                  }`}
                >
                  {formatSats(a)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className="flex-1 border-2 border-on-background px-3 py-2 text-xs font-black uppercase tracking-tight bg-transparent outline-none min-w-0"
                min={1}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 shrink-0">SATS</span>
            </div>

            {/* Optional comment */}
            {currentUser && (
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="ADD_A_MESSAGE..."
                className="w-full border-2 border-on-background/30 px-3 py-2 text-xs font-bold uppercase tracking-tight bg-transparent outline-none placeholder:text-on-background/25"
                maxLength={140}
              />
            )}

            {error && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">{error}</p>
            )}

            {/* Payment buttons */}
            <div className="space-y-2">
              {/* Zap via WebLN */}
              {hasWebLN && (
                <button
                  onClick={handleWebLN}
                  disabled={loading || !lud16}
                  className="w-full bg-primary text-white py-3 font-black uppercase tracking-tight text-sm shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                  ZAP ({formatSats(amount)})
                </button>
              )}

              {/* Zap via NWC */}
              {hasNWC && !hasWebLN && (
                <button
                  onClick={handleNWC}
                  disabled={loading || !lud16}
                  className="w-full bg-primary text-white py-3 font-black uppercase tracking-tight text-sm shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                  ZAP_VIA_NWC ({formatSats(amount)})
                </button>
              )}

              {/* Invoice / QR fallback */}
              <button
                onClick={handleGetInvoice}
                disabled={loading || !lud16}
                className={`w-full py-3 font-black uppercase tracking-tight text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:pointer-events-none ${
                  hasWebLN || hasNWC
                    ? "border-2 border-on-background hover:bg-on-background hover:text-surface"
                    : "bg-primary text-white shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
                }`}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current animate-spin" />
                    LOADING...
                  </>
                ) : !lud16 ? (
                  "NO_LIGHTNING_ADDRESS"
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">qr_code</span>
                    {hasWebLN || hasNWC ? "SHOW_INVOICE" : `GET_INVOICE (${formatSats(amount)})`}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Invoice QR */}
        {state === "invoice" && invoice && (
          <div className="p-4 space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 text-center">
              SCAN_OR_COPY_INVOICE
            </div>

            <div className="flex justify-center bg-white p-2 border-2 border-on-background">
              <QRCode value={invoice} size={200} />
            </div>

            <div className="text-center text-lg font-black uppercase tracking-tight font-headline">
              {formatSats(amount)} SATS
            </div>

            {/* Auto-pay buttons if available */}
            {(hasWebLN || hasNWC) && (
              <button
                onClick={hasWebLN ? handleWebLN : handleNWC}
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 font-black uppercase tracking-tight text-xs shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[14px]">bolt</span>
                PAY_WITH_{hasWebLN ? "WEBLN" : "NWC"}
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!invoice) return;
                  navigator.clipboard.writeText(invoice);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex-1 border-2 border-on-background py-2 text-[10px] font-black uppercase tracking-widest hover:bg-on-background hover:text-surface transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">{copied ? "check" : "content_copy"}</span>
                {copied ? "COPIED" : "COPY"}
              </button>
              <button
                onClick={reset}
                className="flex-1 border-2 border-on-background/30 py-2 text-[10px] font-black uppercase tracking-widest text-on-background/50 hover:border-on-background hover:text-on-background transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                BACK
              </button>
            </div>

            {error && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary text-center">{error}</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
