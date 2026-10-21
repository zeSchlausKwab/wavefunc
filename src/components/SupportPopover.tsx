import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { parseBolt11 } from "applesauce-common/helpers";
import { decode } from "light-bolt11-decoder";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { SUPPORT_PUBKEY, supportRequest, verifySupportReceipt, type SupportProvider } from "../lib/nostr/support";
import { loadSupportEndpoint } from "../lib/nostr/supportService";
import { ContactsModel, ProfileModel } from "applesauce-core/models";
import { FollowUser } from "applesauce-actions/actions";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { merge } from "rxjs";
import {
  getContactsRelayUrls,
  getIdentityRelayUrls,
  getPublicContentRelayUrls,
} from "../config/nostr";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useNWCConnectionStore } from "../stores/nwcConnectionStore";
import { nwcPayInvoice, parseNWCConnectionString } from "../lib/nostr/nwc";
import { openUrl, toLightningUri } from "../lib/openUrl";
import { platformFetch } from "../lib/platformFetch";
import { useUIStore } from "../stores/uiStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { QRCode } from "./QRCode";

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

export function SupportTrigger({
  variant = "icon",
  onOpen,
}: {
  variant?: "icon" | "menu";
  onOpen?: () => void;
}) {
  const openSupport = useUIStore((state) => state.openSupport);

  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openSupport();
      }}
      className={
        variant === "menu"
          ? "flex w-full items-center justify-center gap-2 border-2 border-on-background bg-secondary-fixed-dim px-4 py-3 text-sm font-black uppercase tracking-tight text-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
          : "flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 font-bold uppercase tracking-tighter text-on-background transition-transform hover:skew-x-6 hover:bg-secondary-fixed-dim lg:px-3"
      }
      title="Support WaveFunc"
      aria-label={variant === "menu" ? undefined : "Support WaveFunc"}
      aria-haspopup="dialog"
      data-support-trigger={variant}
    >
      <span className="material-symbols-outlined text-[18px]">
        volunteer_activism
      </span>
      {variant === "menu" && <span>SUPPORT_WAVEFUNC</span>}
    </button>
  );
}

export function SupportDialog() {
  const open = useUIStore((state) => state.supportOpen);
  const closeSupport = useUIStore((state) => state.closeSupport);
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool, accounts, actions } = useWavefuncNostr();
  const nwcConnection = useNWCConnectionStore((s) => s.connection);
  const signer = accounts.active?.signer ?? null;

  const profile = useEventModel(ProfileModel, [SUPPORT_PUBKEY]);
  const contacts = useEventModel(
    ContactsModel,
    currentUser ? [currentUser.pubkey] : null,
  );
  const followsDeveloper =
    contacts?.some((contact) => contact.pubkey === SUPPORT_PUBKEY) ?? false;
  const [amount, setAmount] = useState(5000);
  const [comment, setComment] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<SupportState>("input");
  const [zapStartTime, setZapStartTime] = useState(0);
  const [following, setFollowing] = useState(false);
  const [receiptProvider, setReceiptProvider] = useState<SupportProvider | null>(null);
  const paymentInFlight = useRef(false);
  const generation = useRef(0);
  const paidInvoice = useRef<string | null>(null);
  useEffect(() => { generation.current++; paymentInFlight.current = false; setLoading(false); setInvoice(null); setState("input"); setReceiptProvider(null); }, [open, accounts.active?.id]);
  const [contactsReadyFor, setContactsReadyFor] = useState<string | null>(null);
  const contactsReady =
    !currentUser || contactsReadyFor === currentUser.pubkey;

  const lud16 = profile?.lud16;
  const zapReceiptRelays = useMemo(() => getPublicContentRelayUrls().slice(0, 5), []);

  // Fetch profile on open
  useEffect(() => {
    if (!open) return;
    let active = true;
    setContactsReadyFor(null);
    setError(null);
    const requests = [
      relayPool.request(getIdentityRelayUrls(), [
        { kinds: [0], authors: [SUPPORT_PUBKEY], limit: 1 },
      ]),
    ];
    if (currentUser) {
      requests.push(
        relayPool.request(getContactsRelayUrls(), [
          { kinds: [3], authors: [currentUser.pubkey], limit: 1 },
        ]),
      );
    }
    const sub = merge(...requests)
      .pipe(storeEvents(eventStore))
      .subscribe({
        complete: () => {
          if (active && currentUser) setContactsReadyFor(currentUser.pubkey);
        },
        error: (requestError) => {
          if (!active) return;
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load your current follows",
          );
        },
      });
    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [open, relayPool, eventStore, currentUser?.pubkey]);

  const handleFollowDeveloper = async () => {
    if (!currentUser || !contactsReady || followsDeveloper || following) return;
    setFollowing(true);
    setError(null);
    try {
      await actions.run(FollowUser, {
        pubkey: SUPPORT_PUBKEY,
        relays: getContactsRelayUrls(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to follow developer");
    } finally {
      setFollowing(false);
    }
  };

  const followButtonLabel = !currentUser
    ? "LOG_IN_TO_FOLLOW_THE_DEV"
    : !contactsReady
      ? "LOADING_FOLLOWS..."
      : followsDeveloper
        ? "FOLLOWING_THE_DEV"
        : following
          ? "FOLLOWING..."
          : "FOLLOW_THE_DEV";

  // Monitor for zap receipt (kind 9735)
  useEffect(() => {
    if (!invoice || !receiptProvider || !["invoice", "processing"].includes(state)) return;
    const sub = relayPool
      .subscription(zapReceiptRelays, [
        { kinds: [9735], "#p": [SUPPORT_PUBKEY], since: zapStartTime },
      ])
      .subscribe({
        next: (message) => {
          const event = message;
          const bolt11 = event.tags.find((t) => t[0] === "bolt11")?.[1];
          if (bolt11 === invoice && verifySupportReceipt(event, receiptProvider)) {
            eventStore.add(event);
            paidInvoice.current = invoice;
            setState("success");
          }
        },
        error: () => { /* A receipt relay outage does not mean payment failed. */ },
      });
    return () => sub.unsubscribe();
  }, [invoice, state, zapStartTime, relayPool, zapReceiptRelays, receiptProvider, eventStore]);

  const getInvoice = useCallback(async (sats: number) => {
    if (!lud16 || !Number.isSafeInteger(sats) || sats <= 0) throw new Error("Choose a positive whole-sat amount");
    const amountMsat = sats * 1000;
    if (!Number.isSafeInteger(amountMsat)) throw new Error("Amount is too large");
    const endpoint = await loadSupportEndpoint(lud16);
    if (amountMsat < endpoint.minSendable || amountMsat > endpoint.maxSendable) throw new Error(`Choose between ${endpoint.minSendable / 1000} and ${endpoint.maxSendable / 1000} sats`);
    const request = signer && endpoint.allowsNostr
      ? await signer.signEvent(supportRequest(amountMsat, comment, zapReceiptRelays, endpoint.lnurl)) : null;
    const callback = new URL(endpoint.callback);
    callback.searchParams.set("amount", String(amountMsat));
    callback.searchParams.set("lnurl", endpoint.lnurl);
    if (comment) callback.searchParams.set("comment", comment);
    if (request) callback.searchParams.set("nostr", JSON.stringify(request));
    const response = await platformFetch(callback, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Invoice service returned ${response.status}`);
    const data = await response.json();
    if (data.status === "ERROR" || typeof data.pr !== "string") throw new Error(data.reason || "No invoice returned");
    if (parseBolt11(data.pr).amount !== amountMsat) throw new Error("Invoice amount does not match your request");
    if (request) {
      const hash = decode(data.pr).sections.find(section => String(section.name) === "description_hash");
      const expected = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(request))));
      if (hash && (!("value" in hash) || hash.value !== expected)) throw new Error("Invoice does not match the signed support request");
    }
    return { invoice: data.pr as string, provider: request ? endpoint : null };
  }, [lud16, signer, comment, zapReceiptRelays]);

  const pay = async (method: "invoice" | "webln" | "nwc") => {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    const operation = generation.current;
    let pendingInvoice: string | null = null;
    setLoading(true); setError(null);
    try {
      if (method === "webln") await window.webln?.enable();
      const result = await getInvoice(amount);
      if (operation !== generation.current) return;
      pendingInvoice = result.invoice;
      setInvoice(result.invoice); setReceiptProvider(result.provider);
      setZapStartTime(Math.floor(Date.now()/1000) - 10);
      setState(method === "invoice" ? "invoice" : "processing");
      if (method === "invoice") return;
      const payment = method === "webln"
        ? await window.webln!.sendPayment(result.invoice)
        : await nwcPayInvoice(parseNWCConnectionString(nwcConnection!.connectionString), result.invoice, relayPool);
      if (operation !== generation.current) return;
      if (!payment.preimage || !/^[0-9a-f]{64}$/i.test(payment.preimage)) throw new Error("The wallet did not return a payment preimage");
      const bytes = Uint8Array.from(payment.preimage.match(/../g)!.map(value => parseInt(value, 16)));
      if (bytesToHex(sha256(bytes)) !== parseBolt11(result.invoice).paymentHash) throw new Error("Payment preimage does not match the invoice");
      setState("success");
    } catch (error) {
      if (operation !== generation.current) return;
      if (pendingInvoice && paidInvoice.current === pendingInvoice) return;
      setError(error instanceof Error ? error.message : "Payment failed");
      setState(pendingInvoice ? "invoice" : "input");
    } finally {
      if (operation === generation.current) { paymentInFlight.current = false; setLoading(false); }
    }
  };
  const handleGetInvoice = () => pay("invoice");
  const handleWebLN = () => pay("webln");
  const handleNWC = () => pay("nwc");

  const reset = () => {
    generation.current++;
    paymentInFlight.current = false;
    setReceiptProvider(null);
    setInvoice(null);
    setError(null);
    setCopied(false);
    setComment("");
    setState("input");
    setLoading(false);
  };

  const handleOpenInvoice = async () => {
    if (!invoice) return;
    setError(null);
    try {
      await openUrl(toLightningUri(invoice));
    } catch (err) {
      console.error("Failed to open Lightning wallet:", err);
      setError("No compatible Lightning wallet could open this invoice.");
    }
  };

  const hasWebLN = typeof window !== "undefined" && !!window.webln;
  const hasNWC = !!nwcConnection?.connectionString;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeSupport();
          reset();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 z-[310] flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-surface p-0 shadow-none md:inset-auto md:top-1/2 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-3rem)] md:w-[28rem] md:max-w-[calc(100%-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:border-4 md:border-on-background md:shadow-[10px_10px_0px_0px_rgba(29,28,19,1)]"
      >
        <DialogTitle className="sr-only">Support WaveFunc</DialogTitle>
        <DialogDescription className="sr-only">
          Follow the developer or donate sats to support the project.
        </DialogDescription>

        <div className="shrink-0 bg-surface pt-[env(safe-area-inset-top)]">
          <div className="flex items-stretch border-b-4 border-on-background bg-on-background text-surface">
            <div className="min-w-0 flex-1 px-4 py-3">
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-surface/55">
                SUPPORT_CHANNEL // 001
              </div>
              <div className="truncate font-headline text-xl font-black uppercase tracking-tighter">
                KEEP_THE_SIGNAL_ALIVE
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                closeSupport();
                reset();
              }}
              className="flex w-14 shrink-0 items-center justify-center border-l-2 border-surface/25 transition-colors hover:bg-primary"
              aria-label="Close support"
            >
              <span className="material-symbols-outlined text-[24px]">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto w-full max-w-md">
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

        <div className="px-4 py-3 border-b-2 border-on-background">
          <button
            type="button"
            onClick={handleFollowDeveloper}
            disabled={!currentUser || !contactsReady || followsDeveloper || following}
            className="w-full border-2 border-on-background py-2 text-[10px] font-black uppercase tracking-widest hover:bg-on-background hover:text-surface transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">
              {followsDeveloper ? "person_check" : "person_add"}
            </span>
            {followButtonLabel}
          </button>
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

            <p className="text-xs leading-relaxed text-on-background/60">
              {currentUser ? "Public app-support zaps can appear in the supporter leaderboard with your name and amount." : "Log in to receive public credit on the supporter leaderboard. Payments without a Nostr receipt remain private to your wallet and provider."}
            </p>
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

            <button
              type="button"
              onClick={handleOpenInvoice}
              aria-label="Open this invoice in a Lightning wallet"
              className="flex justify-center w-full bg-white p-2 border-2 border-on-background cursor-pointer"
            >
              <QRCode value={toLightningUri(invoice)} size={200} />
            </button>

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

            <button
              type="button"
              onClick={handleOpenInvoice}
              className="w-full border-2 border-on-background py-2 text-[10px] font-black uppercase tracking-widest hover:bg-on-background hover:text-surface transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              OPEN_WALLET
            </button>

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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
