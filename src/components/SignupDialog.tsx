import { PrivateKeySigner } from "applesauce-signers";
import { Scanner } from "@yudiel/react-qr-scanner";
import { nip19 } from "nostr-tools";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
} from "./ui/dialog";
import { cn } from "../lib/utils";
import { useWavefuncNostr } from "../lib/nostr/runtime";

interface SignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (key: string) => Promise<void>;
}

type WizardView =
  | "choose"
  | "beginner-keys"
  | "beginner-profile"
  | "beginner-done"
  | "expert-create"
  | "expert-import";

type ScannedCode = { rawValue?: string };

interface ProfileDraft {
  name: string;
  about: string;
  picture: string;
}

function BrutalCheckbox({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <div
        className={cn(
          "w-5 h-5 shrink-0 border-2 border-on-background mt-0.5 flex items-center justify-center transition-colors",
          checked ? "bg-on-background" : "group-hover:bg-surface-container-high"
        )}
      >
        {checked && (
          <span className="material-symbols-outlined text-[12px] text-surface">check</span>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-[11px] font-bold uppercase tracking-wide leading-relaxed">
        {children}
      </span>
    </label>
  );
}

function KeyBox({
  value,
  variant = "private",
  copied,
  onCopy,
  onRegenerate,
}: {
  value: string;
  variant?: "private" | "public";
  copied: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
          {variant === "private" ? "PRIVATE_KEY (NSEC) — NEVER SHARE" : "PUBLIC_KEY (NPUB) — SAFE TO SHARE"}
        </span>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="text-[9px] font-black uppercase tracking-widest text-on-background/40 hover:text-on-background transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[12px]">refresh</span>
            REGEN
          </button>
        )}
      </div>
      <div
        className={cn(
          "relative border-4 p-3 font-mono text-[11px] break-all leading-relaxed pr-10",
          variant === "private"
            ? "border-red-600 bg-red-50 dark:bg-red-950/20"
            : "border-on-background bg-surface-container-low"
        )}
      >
        {value || <span className="opacity-30">GENERATING...</span>}
        <button
          onClick={onCopy}
          className="absolute top-2 right-2 p-1 border-2 border-on-background bg-surface hover:bg-surface-container-high transition-colors"
          title="Copy"
        >
          <span className="material-symbols-outlined text-[14px]">
            {copied ? "check" : "content_copy"}
          </span>
        </button>
      </div>
    </div>
  );
}

function BrutalInput({
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  autoFocus,
  autoComplete,
  suffix,
}: {
  id?: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex">
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className={cn(
            "flex-1 border-2 border-on-background bg-surface-container-low px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-primary placeholder:text-on-background/30 placeholder:font-sans placeholder:uppercase placeholder:tracking-wider placeholder:text-[11px]",
            error && "border-red-600"
          )}
        />
        {suffix}
      </div>
      {error && (
        <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

const VIEW_META: Record<WizardView, { title: string; step?: string }> = {
  choose: { title: "CONNECT_TO_NOSTR" },
  "beginner-keys": { title: "YOUR_NOSTR_IDENTITY", step: "STEP_1_OF_2 — SAVE_YOUR_KEYS" },
  "beginner-profile": { title: "SET_UP_YOUR_PROFILE", step: "STEP_2_OF_2 — OPTIONAL" },
  "beginner-done": { title: "YOURE_ON_NOSTR" },
  "expert-create": { title: "GENERATE_NEW_KEY" },
  "expert-import": { title: "IMPORT_EXISTING_KEY" },
};

export function SignupDialog({ open, onOpenChange, onConfirm }: SignupDialogProps) {
  const { signAndPublish } = useWavefuncNostr();
  const [view, setView] = useState<WizardView>("choose");
  const [signer, setSigner] = useState<PrivateKeySigner | null>(null);
  const [nsec, setNsec] = useState("");
  const [npub, setNpub] = useState("");
  const [nsecCopied, setNsecCopied] = useState(false);
  const [npubCopied, setNpubCopied] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({ name: "", about: "", picture: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [importKey, setImportKey] = useState("");
  const [importError, setImportError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const qrContainerRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setView("choose");
    setSigner(null);
    setNsec("");
    setNpub("");
    setNsecCopied(false);
    setNpubCopied(false);
    setKeySaved(false);
    setLoading(false);
    setProfileDraft({ name: "", about: "", picture: "" });
    setProfileLoading(false);
    setImportKey("");
    setImportError("");
    setShowScanner(false);
    setScanError(null);
  }, []);

  const generateNewKey = useCallback(() => {
    const newSigner = new PrivateKeySigner();
    setSigner(newSigner);
    setNsecCopied(false);
    setNpubCopied(false);
    setKeySaved(false);
    setNsec(nip19.nsecEncode(newSigner.key));
    newSigner.getPublicKey().then((pubkey) => {
      setNpub(nip19.npubEncode(pubkey));
    });
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (open && (view === "beginner-keys" || view === "expert-create") && !signer) {
      generateNewKey();
    }
  }, [open, view, signer, generateNewKey]);

  const handleCopyNsec = async () => {
    await navigator.clipboard.writeText(nsec);
    setNsecCopied(true);
    setTimeout(() => setNsecCopied(false), 2000);
  };

  const handleCopyNpub = async () => {
    await navigator.clipboard.writeText(npub);
    setNpubCopied(true);
    setTimeout(() => setNpubCopied(false), 2000);
  };

  const handleDownloadBackup = () => {
    const canvas = qrContainerRef.current?.querySelector("canvas");
    const qrDataUrl = canvas ? canvas.toDataURL("image/png") : "";
    const printWindow = window.open("", "_blank", "width=800,height=700");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>WaveFunc \u2013 Nostr Identity Backup</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: monospace; max-width: 580px; margin: 40px auto; padding: 32px; color: #111; }
.header { font-weight: 900; font-size: 18px; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 4px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
.warning { border: 4px solid #dc2626; padding: 16px; margin-bottom: 20px; }
.warning-title { font-weight: 900; text-transform: uppercase; font-size: 12px; letter-spacing: 0.1em; color: #dc2626; margin-bottom: 6px; }
.warning p { font-size: 12px; line-height: 1.5; }
.qr-section { text-align: center; margin: 20px 0; }
.key-section { border: 4px solid #dc2626; padding: 16px; margin-bottom: 12px; }
.key-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #dc2626; margin-bottom: 8px; }
.key-value { font-size: 11px; word-break: break-all; line-height: 1.7; }
.pub-section { border: 4px solid #111; padding: 16px; margin-bottom: 20px; }
.pub-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
.footer { font-size: 10px; text-align: center; border-top: 2px solid #ccc; padding-top: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
@media print { body { margin: 0; } }</style></head>
<body>
<div class="header">WaveFunc Radio \u00b7 Nostr Identity Backup \u00b7 ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
<div class="warning"><div class="warning-title">\u26a0 Keep this document private</div><p>Your private key gives full access to your account. Store in a secure place — a safe, password manager, or encrypted drive. Never photograph or share it.</p></div>
${qrDataUrl ? `<div class="qr-section"><img src="${qrDataUrl}" width="160" height="160" alt="QR code"/><div style="font-size:11px;margin-top:8px;text-transform:uppercase;letter-spacing:0.05em">Scan to import private key</div></div>` : ""}
<div class="key-section"><div class="key-label">\ud83d\udd12 Private Key (nsec) — Never share</div><div class="key-value">${nsec}</div></div>
<div class="pub-section"><div class="pub-label">\ud83d\udce2 Public Key (npub) — Safe to share</div><div class="key-value">${npub}</div></div>
<div class="footer">wavefunc.live \u00b7 Your keys never leave your device</div>
<script>setTimeout(() => window.print(), 400)</script></body></html>`);
    printWindow.document.close();
  };

  const parsePrivateKey = useCallback((input: string): string | null => {
    const trimmed = input.trim();
    if (trimmed.startsWith("nsec1")) {
      try {
        const { type, data } = nip19.decode(trimmed);
        if (type === "nsec")
          return Array.from(data as Uint8Array)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
      } catch (_e) {
        return null;
      }
    }
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
    return null;
  }, []);

  const handleImportKeyChange = (value: string) => {
    setImportKey(value);
    setImportError("");
    if (value.trim() && !parsePrivateKey(value)) {
      setImportError("INVALID_KEY — ENTER NSEC1... OR 64-CHAR HEX");
    }
  };

  const handleScan = useCallback(
    (detectedCodes: ScannedCode[]) => {
      const result = detectedCodes[0]?.rawValue;
      if (!result) return;
      if (parsePrivateKey(result)) {
        setImportKey(result);
        setImportError("");
        setShowScanner(false);
        setScanError(null);
      } else {
        setScanError("QR_CODE_DOES_NOT_CONTAIN_A_VALID_PRIVATE_KEY");
      }
    },
    [parsePrivateKey]
  );

  const handleScanError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Unknown error";
    setScanError(`CAMERA_ERROR: ${msg}`);
  }, []);

  const handleBeginnerNext = async () => {
    if (!nsec || !keySaved) return;
    setLoading(true);
    try {
      await onConfirm(nsec);
      setView("beginner-profile");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePublishProfile = async (skip = false) => {
    setProfileLoading(true);
    try {
      if (!skip && (profileDraft.name || profileDraft.about || profileDraft.picture)) {
        await signAndPublish({
          kind: 0,
          tags: [],
          content: JSON.stringify({
            name: profileDraft.name || undefined,
            displayName: profileDraft.name || undefined,
            about: profileDraft.about || undefined,
            image: profileDraft.picture || undefined,
            picture: profileDraft.picture || undefined,
          }),
        });
      }
      setView("beginner-done");
    } catch (error) {
      console.error("Profile publish failed:", error);
      setView("beginner-done");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleExpertConfirm = async () => {
    if (!nsec) return;
    setLoading(true);
    try {
      await onConfirm(nsec);
      onOpenChange(false);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    const hex = parsePrivateKey(importKey);
    if (!hex) {
      setImportError("INVALID_KEY — ENTER NSEC1... OR 64-CHAR HEX");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(importKey.trim());
      onOpenChange(false);
    } catch (error) {
      console.error("Import failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const meta = VIEW_META[view];
  const canGoBack = view === "beginner-keys" || view === "expert-create" || view === "expert-import";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="rounded-none border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] p-0 max-w-lg gap-0 overflow-hidden"
        >
          {/* Hidden QR for backup */}
          {nsec && (
            <div ref={qrContainerRef} className="hidden" aria-hidden="true">
              <QRCodeCanvas value={nsec} size={200} />
            </div>
          )}

          {/* Header */}
          <div className="border-b-4 border-on-background bg-on-background text-surface px-6 py-4">
            <div className="text-xl font-black uppercase tracking-tighter font-headline">
              {meta.title.replace(/_/g, " ")}
            </div>
            {meta.step && (
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-0.5">
                {meta.step}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-none">

            {/* ── CHOOSE ── */}
            {view === "choose" && (
              <div className="space-y-4">
                <button
                  onClick={() => setView("beginner-keys")}
                  className="w-full border-4 border-on-background p-5 text-left shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all group bg-surface-container-low"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl text-white">
                        auto_awesome
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black uppercase tracking-tight text-base">
                        NEW TO NOSTR? GET YOUR IDENTITY
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 mt-0.5">
                        GUIDED SETUP WITH KEY BACKUP AND PROFILE
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-xl text-primary group-hover:translate-x-1 transition-transform shrink-0">
                      arrow_forward
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-on-background/20" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-background/40">
                    OR_IF_YOU_KNOW_WHAT_YOURE_DOING
                  </span>
                  <div className="flex-1 h-px bg-on-background/20" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { view: "expert-create" as WizardView, icon: "key", label: "GENERATE_NEW_KEY", sub: "FRESH PRIVATE KEY" },
                    { view: "expert-import" as WizardView, icon: "login", label: "IMPORT_EXISTING", sub: "USE YOUR NSEC / HEX" },
                  ].map(({ view: v, icon, label, sub }) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className="border-4 border-on-background p-4 text-left hover:bg-surface-container-high transition-colors group"
                    >
                      <span className="material-symbols-outlined text-2xl text-on-background/40 group-hover:text-on-background transition-colors block mb-2">
                        {icon}
                      </span>
                      <div className="font-black uppercase tracking-tight text-sm">{label}</div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-on-background/40 mt-0.5">{sub}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── BEGINNER KEYS ── */}
            {view === "beginner-keys" && (
              <div className="space-y-5">
                <div className="border-4 border-on-background/20 bg-surface-container-low p-4 space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest">WHAT_IS_NOSTR?</div>
                  <p className="text-[11px] font-bold text-on-background/60 leading-relaxed uppercase tracking-wide">
                    A decentralized protocol where your identity is two cryptographic keys — no company controls your account.
                  </p>
                </div>

                <KeyBox
                  value={nsec}
                  variant="private"
                  copied={nsecCopied}
                  onCopy={handleCopyNsec}
                  onRegenerate={generateNewKey}
                />
                <KeyBox
                  value={npub}
                  variant="public"
                  copied={npubCopied}
                  onCopy={handleCopyNpub}
                />

                <button
                  onClick={handleDownloadBackup}
                  disabled={!nsec}
                  className="w-full border-2 border-on-background/40 px-4 py-2.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-surface-container-high transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  DOWNLOAD_BACKUP_CARD (PRINTABLE PDF + QR)
                </button>

                <BrutalCheckbox id="key-saved" checked={keySaved} onChange={setKeySaved}>
                  I HAVE SAVED MY PRIVATE KEY IN A SAFE PLACE. I UNDERSTAND THAT LOSING IT MEANS PERMANENTLY LOSING ACCESS TO MY ACCOUNT.
                </BrutalCheckbox>
              </div>
            )}

            {/* ── BEGINNER PROFILE ── */}
            {view === "beginner-profile" && (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-on-background/50 mb-2">
                    DISPLAY_NAME
                  </div>
                  <BrutalInput
                    id="profile-name"
                    placeholder="e.g. ALICE..."
                    value={profileDraft.name}
                    onChange={(v) => setProfileDraft((d) => ({ ...d, name: v }))}
                    autoFocus
                  />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-on-background/50 mb-2">
                    ABOUT <span className="font-bold">(OPTIONAL)</span>
                  </div>
                  <textarea
                    placeholder="A SHORT BIO..."
                    rows={3}
                    value={profileDraft.about}
                    onChange={(e) => setProfileDraft((d) => ({ ...d, about: e.target.value }))}
                    className="w-full border-2 border-on-background bg-surface-container-low px-3 py-2.5 text-sm font-bold focus:outline-none focus:border-primary placeholder:text-on-background/30 placeholder:uppercase placeholder:tracking-wider placeholder:text-[11px] resize-none"
                  />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-on-background/50 mb-2">
                    PROFILE_PICTURE_URL <span className="font-bold">(OPTIONAL)</span>
                  </div>
                  <BrutalInput
                    id="profile-picture"
                    placeholder="HTTPS://..."
                    value={profileDraft.picture}
                    onChange={(v) => setProfileDraft((d) => ({ ...d, picture: v }))}
                  />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-background/40">
                  YOU CAN ALWAYS UPDATE YOUR PROFILE LATER IN SETTINGS.
                </p>
              </div>
            )}

            {/* ── BEGINNER DONE ── */}
            {view === "beginner-done" && (
              <div className="py-8 flex flex-col items-center gap-5 text-center">
                <div className="w-20 h-20 bg-on-background flex items-center justify-center">
                  <span className="material-symbols-outlined text-4xl text-surface" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                </div>
                <div>
                  <div className="text-2xl font-black uppercase tracking-tighter font-headline mb-2">
                    WELCOME TO NOSTR!
                  </div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-on-background/50 max-w-xs">
                    YOUR IDENTITY IS SET UP. START EXPLORING RADIO STATIONS AND BUILDING YOUR COLLECTION.
                  </p>
                </div>
              </div>
            )}

            {/* ── EXPERT CREATE ── */}
            {view === "expert-create" && (
              <div className="space-y-5">
                <div className="border-4 border-red-600 p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-600 text-xl shrink-0">warning</span>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">
                      SAVE_YOUR_PRIVATE_KEY
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-on-background/60 leading-relaxed">
                      This is the only way to access your account. Losing it means losing access permanently. Store in a password manager.
                    </p>
                  </div>
                </div>
                <KeyBox
                  value={nsec}
                  variant="private"
                  copied={nsecCopied}
                  onCopy={handleCopyNsec}
                  onRegenerate={generateNewKey}
                />
                <KeyBox
                  value={npub}
                  variant="public"
                  copied={npubCopied}
                  onCopy={handleCopyNpub}
                />
              </div>
            )}

            {/* ── EXPERT IMPORT ── */}
            {view === "expert-import" && (
              <div className="space-y-5">
                <div className="border-4 border-red-600 p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-600 text-xl shrink-0">security</span>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">
                      SECURITY_WARNING
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-on-background/60 leading-relaxed">
                      Only enter your private key on trusted devices. Anyone with your private key controls your account. Your key never leaves your device.
                    </p>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-on-background/50 mb-2">
                    PRIVATE_KEY (NSEC OR HEX)
                  </div>
                  <BrutalInput
                    id="import-key"
                    type="password"
                    placeholder="NSEC1... OR 64-CHAR HEX"
                    value={importKey}
                    onChange={handleImportKeyChange}
                    error={importError}
                    autoComplete="off"
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="border-2 border-l-0 border-on-background px-3 hover:bg-surface-container-high transition-colors"
                        title="Scan QR code"
                      >
                        <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
                      </button>
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t-4 border-on-background px-4 py-3 flex items-center gap-2 flex-wrap">
            {canGoBack && (
              <button
                onClick={() => { setSigner(null); setView("choose"); }}
                disabled={loading}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-on-background/50 hover:text-on-background transition-colors disabled:opacity-30 mr-auto"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                BACK
              </button>
            )}

            {view === "choose" && (
              <button
                onClick={() => onOpenChange(false)}
                className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border-2 border-on-background/40 hover:bg-surface-container-high transition-colors ml-auto"
              >
                CANCEL
              </button>
            )}

            {view === "beginner-keys" && (
              <>
                <button
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border-2 border-on-background/40 hover:bg-surface-container-high transition-colors disabled:opacity-30"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleBeginnerNext}
                  disabled={loading || !keySaved}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-primary text-white shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-30 disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] flex items-center gap-1.5"
                >
                  {loading && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
                  {loading ? "SETTING_UP..." : "NEXT: SETUP PROFILE →"}
                </button>
              </>
            )}

            {view === "beginner-profile" && (
              <>
                <button
                  onClick={() => handlePublishProfile(true)}
                  disabled={profileLoading}
                  className="text-[10px] font-black uppercase tracking-widest text-on-background/50 hover:text-on-background transition-colors disabled:opacity-30 mr-auto"
                >
                  SKIP_FOR_NOW
                </button>
                <button
                  onClick={() => handlePublishProfile(false)}
                  disabled={profileLoading}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-primary text-white shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-30 flex items-center gap-1.5"
                >
                  {profileLoading && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
                  {profileLoading ? "SAVING..." : "CREATE_MY_IDENTITY →"}
                </button>
              </>
            )}

            {view === "beginner-done" && (
              <button
                onClick={() => onOpenChange(false)}
                className="w-full text-[10px] font-black uppercase tracking-widest px-4 py-3 bg-on-background text-surface shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                START_EXPLORING →
              </button>
            )}

            {view === "expert-create" && (
              <>
                <button
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border-2 border-on-background/40 hover:bg-surface-container-high transition-colors disabled:opacity-30"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleExpertConfirm}
                  disabled={loading || !signer}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-primary text-white shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-30 flex items-center gap-1.5"
                >
                  {loading && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
                  {loading ? "CREATING..." : "IVE_SAVED_MY_KEY →"}
                </button>
              </>
            )}

            {view === "expert-import" && (
              <>
                <button
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border-2 border-on-background/40 hover:bg-surface-container-high transition-colors disabled:opacity-30"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleImportConfirm}
                  disabled={loading || !importKey || !!importError}
                  className="text-[10px] font-black uppercase tracking-widest px-4 py-2 bg-primary text-white shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-30 flex items-center gap-1.5"
                >
                  {loading && <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>}
                  {loading ? "LOGGING_IN..." : "LOGIN →"}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Dialog */}
      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent
          showCloseButton={false}
          className="rounded-none border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] p-0 max-w-sm gap-0"
        >
          <div className="border-b-4 border-on-background bg-on-background text-surface px-5 py-3">
            <div className="font-black uppercase tracking-tighter">SCAN_PRIVATE_KEY_QR</div>
          </div>
          <div className="p-5 space-y-4">
            {scanError ? (
              <>
                <div className="border-4 border-red-600 p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-600 shrink-0">error</span>
                  <p className="text-[11px] font-black uppercase tracking-wide">{scanError}</p>
                </div>
                <button
                  onClick={() => setScanError(null)}
                  className="w-full border-2 border-on-background px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-surface-container-high transition-colors"
                >
                  TRY_AGAIN
                </button>
              </>
            ) : (
              <div className="border-4 border-on-background aspect-square overflow-hidden">
                <Scanner
                  onScan={handleScan}
                  onError={handleScanError}
                  constraints={{ facingMode: "environment" }}
                />
              </div>
            )}
          </div>
          <div className="border-t-4 border-on-background px-5 py-3 flex justify-end">
            <button
              onClick={() => setShowScanner(false)}
              className="text-[10px] font-black uppercase tracking-widest px-4 py-2 border-2 border-on-background hover:bg-surface-container-high transition-colors"
            >
              CANCEL
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
