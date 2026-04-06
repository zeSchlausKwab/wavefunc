import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { NostrConnectSigner } from "applesauce-signers";
import { Scanner } from "@yudiel/react-qr-scanner";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "./ui/dialog";
import { useWavefuncNostr } from "../lib/nostr/runtime";

interface Nip46LoginDialogProps {
  trigger: React.ReactNode;
  onLogin: (bunker: string) => Promise<void>;
}

type TabType = "scan" | "paste";

const DEFAULT_RELAYS = [
  { value: "wss://relay.primal.net", label: "relay.primal.net (recommended)" },
  { value: "wss://relay.damus.io", label: "relay.damus.io" },
  { value: "wss://nos.lol", label: "nos.lol" },
  { value: "wss://relay.nsec.app", label: "relay.nsec.app" },
  { value: "wss://relay.wavefunc.live", label: "relay.wavefunc.live" },
];

type ConnectionState =
  | "idle"
  | "generating"
  | "waiting"
  | "connected"
  | "error";

const CONNECTION_APP_NAME =
  process.env.NODE_ENV === "production"
    ? "Wavefunc Radio"
    : "Wavefunc Radio DEV";

export function Nip46LoginDialog({ trigger, onLogin }: Nip46LoginDialogProps) {
  const { createNostrConnectSigner } = useWavefuncNostr();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("scan");

  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedRelay, setSelectedRelay] = useState(DEFAULT_RELAYS[0].value);

  const [connectionUri, setConnectionUri] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const signerRef = useRef<NostrConnectSigner | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (signerRef.current) {
      signerRef.current.close().catch(() => undefined);
    }
    signerRef.current = null;
  }, []);

  const buildBunkerUri = useCallback((signer: NostrConnectSigner) => {
    if (!signer.remote) {
      throw new Error("Remote signer pubkey is missing");
    }

    const params = new URLSearchParams();
    for (const relay of signer.relays) {
      params.append("relay", relay);
    }
    if (signer.secret) {
      params.set("secret", signer.secret);
    }

    return `bunker://${signer.remote}?${params.toString()}`;
  }, []);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      cleanup();
      setState("idle");
      setError(null);
      setConnectionUri("");
      setBunkerUrl("");
      setShowScanner(false);
      setScanError(null);
    }
  };

  const handleRelayChange = (relay: string) => {
    setSelectedRelay(relay);
    if (activeTab === "scan" && connectionUri) {
      cleanup();
      setConnectionUri("");
      setState("idle");
      setError(null);
    }
  };

  useEffect(() => {
    if (!open || activeTab !== "scan" || connectionUri) return;

    const initConnection = async () => {
      setState("generating");
      setError(null);
      try {
        const signer = createNostrConnectSigner({
          relays: [selectedRelay],
        });
        signerRef.current = signer;

        const uri = signer.getNostrConnectURI({
          name: CONNECTION_APP_NAME,
          url: window.location.origin,
        });

        setConnectionUri(uri);
        setState("waiting");

        const controller = new AbortController();
        abortRef.current = controller;

        timeoutRef.current = window.setTimeout(() => {
          controller.abort();
          setState("error");
          setError("Connection timed out. Please try again.");
        }, 300000);

        await signer.waitForSigner(controller.signal);
        setState("connected");
        await onLogin(buildBunkerUri(signer));
        cleanup();
        setOpen(false);
      } catch (err) {
        if (abortRef.current?.signal.aborted) {
          return;
        }
        console.error("Failed to initialize connection:", err);
        setState("error");
        setError(err instanceof Error ? err.message : "Failed to initialize");
      }
    };

    initConnection();
  }, [activeTab, buildBunkerUri, cleanup, connectionUri, createNostrConnectSigner, onLogin, open, selectedRelay]);

  const handlePasteLogin = async () => {
    if (!bunkerUrl.trim()) {
      setError("Please enter a bunker URL");
      return;
    }

    setState("generating");
    setError(null);

    try {
      if (!bunkerUrl.trim().startsWith("bunker://")) {
        throw new Error("Bunker URL must start with bunker://");
      }
      await onLogin(bunkerUrl.trim());
      setOpen(false);
    } catch (err: any) {
      console.error("NIP-46 login failed:", err);
      setState("error");
      setError(err.message || "Failed to connect with bunker URL");
    }
  };

  const handleScanQR = () => {
    setShowScanner(true);
    setScanError(null);
  };

  const handleScan = useCallback((detectedCodes: any[]) => {
    if (detectedCodes && detectedCodes.length > 0) {
      const result = detectedCodes[0].rawValue;
      if (result && result.startsWith("bunker://")) {
        setBunkerUrl(result);
        setError(null);
        setShowScanner(false);
      } else if (result) {
        setScanError("The scanned code is not a valid bunker:// URI");
      }
    }
  }, []);

  const handleScanError = useCallback((err: any) => {
    console.error(err);
    setScanError("Error accessing camera: " + (err.message || "Unknown error"));
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-none border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] p-0 max-w-md gap-0 overflow-hidden">

        <div className="bg-on-background text-surface px-5 py-4">
          <h2 className="text-base font-black uppercase tracking-tighter">Remote Signer</h2>
          <p className="text-xs font-medium text-surface/60 mt-0.5 uppercase tracking-wide">
            Connect with Amber, nsecBunker, or similar
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
              NIP-46 Relay
            </label>
            <div className="border-2 border-on-background">
              <select
                value={selectedRelay}
                onChange={(e) => handleRelayChange(e.target.value)}
                className="w-full bg-surface text-on-background text-xs font-mono px-3 py-2 appearance-none cursor-pointer focus:outline-none"
              >
                {DEFAULT_RELAYS.map((relay) => (
                  <option key={relay.value} value={relay.value}>
                    {relay.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-on-background/50 uppercase tracking-wide">
              Your remote signer must use the same relay
            </p>
          </div>

          <div className="flex border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">
            <button
              onClick={() => setActiveTab("scan")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-colors border-r-4 border-on-background ${
                activeTab === "scan"
                  ? "bg-on-background text-surface"
                  : "bg-surface text-on-background hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">qr_code</span>
              Scan QR
            </button>
            <button
              onClick={() => setActiveTab("paste")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                activeTab === "paste"
                  ? "bg-on-background text-surface"
                  : "bg-surface text-on-background hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">link</span>
              Paste URL
            </button>
          </div>

          {activeTab === "scan" ? (
            <div className="space-y-4">
              {state === "connected" ? (
                <div className="flex flex-col items-center gap-3 py-8 border-4 border-on-background bg-surface-container-low">
                  <span className="material-symbols-outlined text-[48px] text-primary">check_circle</span>
                  <p className="text-sm font-black uppercase tracking-tighter">Connected!</p>
                  <p className="text-[11px] text-on-background/60 uppercase tracking-wide">Logging you in...</p>
                </div>
              ) : state === "generating" || !connectionUri ? (
                <div className="flex flex-col items-center gap-3 py-8 border-4 border-on-background bg-surface-container-low">
                  <span className="material-symbols-outlined text-[36px] animate-spin">sync</span>
                  <p className="text-[11px] text-on-background/60 uppercase tracking-wide">
                    {state === "generating" ? "Generating connection..." : "Initializing..."}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-on-background/60 uppercase tracking-wide">
                    Scan with Amber or another remote signer
                  </p>

                  <a
                    href={connectionUri}
                    className="block border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] p-3 bg-white"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <QRCodeSVG
                      value={connectionUri}
                      size={250}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="L"
                      className="w-full h-auto"
                    />
                  </a>

                  {state === "waiting" && (
                    <div className="flex items-center gap-2 border-2 border-on-background/30 px-3 py-2 bg-surface-container-low">
                      <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                      <span className="text-[11px] font-black uppercase tracking-widest">Waiting for approval...</span>
                    </div>
                  )}

                  <div className="border-2 border-on-background/30">
                    <input
                      value={connectionUri}
                      readOnly
                      onClick={(e) => e.currentTarget.select()}
                      className="w-full bg-surface-container-low px-3 py-2 font-mono text-[10px] text-on-background/60 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
                  Bunker URL
                </label>
                <p className="text-[10px] text-on-background/50 uppercase tracking-wide">
                  Paste your bunker:// string from nsec.app, Amber, etc.
                </p>
                <div className="flex border-2 border-on-background">
                  <input
                    type="text"
                    placeholder="bunker://..."
                    value={bunkerUrl}
                    onChange={(e) => { setBunkerUrl(e.target.value); setError(null); }}
                    disabled={state === "generating"}
                    className="flex-1 bg-surface text-on-background font-mono text-xs px-3 py-2 focus:outline-none disabled:opacity-40 placeholder:text-on-background/30"
                  />
                  <button
                    type="button"
                    onClick={handleScanQR}
                    disabled={state === "generating"}
                    title="Scan QR code"
                    className="border-l-2 border-on-background px-3 flex items-center hover:bg-surface-container-high transition-colors disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                  </button>
                </div>
              </div>

              <button
                onClick={handlePasteLogin}
                disabled={state === "generating" || !bunkerUrl.trim()}
                className="w-full flex items-center justify-center gap-2 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest bg-primary text-on-primary hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(29,28,19,1)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]"
              >
                {state === "generating" ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    Connecting...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">login</span>
                    Connect
                  </>
                )}
              </button>

              <div className="border-2 border-on-background/30 p-3 bg-surface-container-low">
                <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">How to get a bunker URL</h4>
                <ol className="text-[11px] text-on-background/60 space-y-1 list-decimal list-inside">
                  <li>Open your remote signer (nsec.app, Amber, etc.)</li>
                  <li>Generate or copy your bunker connection string</li>
                  <li>Paste it above or scan the QR code</li>
                </ol>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 border-2 border-red-600 bg-red-50 px-3 py-2">
              <span className="material-symbols-outlined text-[16px] text-red-600 shrink-0 mt-0.5">error</span>
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent className="rounded-none border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] p-0 max-w-sm gap-0 overflow-hidden">
          <div className="bg-on-background text-surface px-5 py-4">
            <h2 className="text-base font-black uppercase tracking-tighter">Scan Bunker QR</h2>
            <p className="text-xs font-medium text-surface/60 mt-0.5 uppercase tracking-wide">
              Point camera at bunker:// QR code
            </p>
          </div>

          <div className="p-5 space-y-4">
            {scanError ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 border-2 border-red-600 bg-red-50 px-3 py-2">
                  <span className="material-symbols-outlined text-[16px] text-red-600 shrink-0 mt-0.5">error</span>
                  <p className="text-xs font-bold text-red-700">{scanError}</p>
                </div>
                <button
                  onClick={() => setScanError(null)}
                  className="w-full border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(29,28,19,1)] transition-all"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] overflow-hidden aspect-square">
                <Scanner
                  onScan={handleScan}
                  onError={handleScanError}
                  constraints={{ facingMode: "environment" }}
                />
              </div>
            )}

            <button
              onClick={() => setShowScanner(false)}
              className="w-full border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(29,28,19,1)] transition-all"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
