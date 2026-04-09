import { use$ } from "applesauce-react/hooks";
import { useState, useCallback } from "react";
import type { Wallet } from "applesauce-wallet/casts";
import {
  SetWalletMints,
  SetWalletRelays,
  ConsolidateTokens,
  RecoverFromCouch,
} from "applesauce-wallet/actions";
import { nip19 } from "nostr-tools";
import { bytesToHex } from "nostr-tools/utils";
import { actions, couch } from "../../lib/nostr/store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function MintManager({ wallet }: { wallet: Wallet }) {
  const mints = use$(wallet.mints$);
  const balance = use$(wallet.balance$);
  const [newMint, setNewMint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    const url = newMint.trim();
    if (!url) return;
    if (mints?.includes(url)) return setError("Already added");
    setSaving(true);
    setError(null);
    try {
      await actions.run(SetWalletMints, [...(mints || []), url]);
      setNewMint("");
    } catch (err: any) {
      setError(err?.message || "Failed to add mint");
    } finally {
      setSaving(false);
    }
  }, [newMint, mints]);

  const handleRemove = useCallback(async (mintUrl: string) => {
    const mintBalance = balance?.[mintUrl] || 0;
    if (mintBalance > 0 && !confirm(`This mint has ${mintBalance} sats. Remove anyway?`)) return;
    setSaving(true);
    try {
      await actions.run(SetWalletMints, (mints || []).filter((m) => m !== mintUrl));
    } catch (err: any) {
      setError(err?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }, [mints, balance]);

  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer text-sm font-semibold flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">›</span>
        Mints
      </summary>
      {mints && mints.length > 0 ? (
        <div className="space-y-2">
          {mints.map((mint) => (
            <div key={mint} className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs truncate">{mint}</div>
                {balance?.[mint] ? (
                  <div className="text-xs text-muted-foreground">{balance[mint]} sats</div>
                ) : null}
              </div>
              <Button variant="destructive" size="sm" onClick={() => handleRemove(mint)} disabled={saving}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No mints configured</p>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="https://mint.example.com"
          value={newMint}
          onChange={(e) => setNewMint(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          disabled={saving}
        />
        <Button onClick={handleAdd} disabled={saving || !newMint.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </details>
  );
}

function RelayManager({ wallet }: { wallet: Wallet }) {
  const relays = use$(wallet.relays$);
  const [newRelay, setNewRelay] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    const url = newRelay.trim();
    if (!url) return;
    if (relays?.includes(url)) return setError("Already added");
    setSaving(true);
    setError(null);
    try {
      await actions.run(SetWalletRelays, [...(relays || []), url]);
      setNewRelay("");
    } catch (err: any) {
      setError(err?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }, [newRelay, relays]);

  const handleRemove = useCallback(async (relayUrl: string) => {
    setSaving(true);
    try {
      await actions.run(SetWalletRelays, (relays || []).filter((r) => r !== relayUrl));
    } catch (err: any) {
      setError(err?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }, [relays]);

  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer text-sm font-semibold flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">›</span>
        Wallet Relays
      </summary>
      {relays && relays.length > 0 ? (
        <div className="space-y-2">
          {relays.map((relay) => (
            <div key={relay} className="flex items-center justify-between p-2 bg-muted/50 rounded">
              <span className="font-mono text-xs truncate">{relay}</span>
              <Button variant="destructive" size="sm" onClick={() => handleRemove(relay)} disabled={saving}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No relays configured</p>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="wss://relay.example.com"
          value={newRelay}
          onChange={(e) => setNewRelay(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          disabled={saving}
        />
        <Button onClick={handleAdd} disabled={saving || !newRelay.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </details>
  );
}

function BackupTool({ wallet }: { wallet: Wallet }) {
  const mints = use$(wallet.mints$);
  const relays = use$(wallet.relays$);
  const privateKey = use$(wallet.privateKey$);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const nsec = privateKey ? nip19.nsecEncode(privateKey) : null;
  const hex = privateKey ? bytesToHex(privateKey) : null;

  const backupJson = JSON.stringify(
    {
      type: "nip-60-wallet-backup",
      version: 1,
      mints: mints || [],
      relays: relays || [],
      privateKey: hex,
    },
    null,
    2
  );

  const copy = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer text-sm font-semibold flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">›</span>
        Backup & Recovery
      </summary>
      <p className="text-xs text-muted-foreground">
        Your wallet is already backed up on Nostr relays (encrypted). The P2PK
        private key below is needed to receive nutzaps — keep it safe.
      </p>

      {!show ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShow(true)}
          className="w-full"
        >
          Show Recovery Info
        </Button>
      ) : (
        <div className="space-y-3">
          {nsec && (
            <div className="space-y-1">
              <label className="text-xs font-medium">
                P2PK Nutzap Key (nsec)
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={nsec}
                  readOnly
                  className="flex-1 h-9 rounded-md border border-input bg-muted/50 px-3 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(nsec, "nsec")}
                >
                  {copied === "nsec" ? "Copied!" : "Copy"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Keep private. Required to redeem NIP-61 nutzaps sent to you.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Full Backup (JSON)</label>
            <textarea
              value={backupJson}
              readOnly
              className="w-full h-32 rounded-md border border-input bg-muted/50 px-3 py-2 font-mono text-[10px] resize-none"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => copy(backupJson, "json")}
              className="w-full"
            >
              {copied === "json" ? "Copied!" : "Copy Backup"}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShow(false)}
            className="w-full"
          >
            Hide
          </Button>
        </div>
      )}
    </details>
  );
}

function ToolsSection() {
  const [consolidating, setConsolidating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <details className="group space-y-3">
      <summary className="cursor-pointer text-sm font-semibold flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90">›</span>
        Maintenance
      </summary>

      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setConsolidating(true);
            setError(null);
            try {
              await actions.run(ConsolidateTokens, { unlockTokens: true });
            } catch (err: any) {
              console.error("Consolidate failed:", err);
              setError(err?.message || "Consolidate failed");
            } finally {
              setConsolidating(false);
            }
          }}
          disabled={consolidating}
          className="w-full justify-start"
        >
          {consolidating ? "Consolidating..." : "Consolidate Tokens"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Combines all tokens into one per mint — reduces event count.
        </p>
      </div>

      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setRecovering(true);
            setError(null);
            try {
              await actions.run(RecoverFromCouch, couch);
            } catch (err: any) {
              console.error("Recover failed:", err);
              setError(err?.message || "Recover failed");
            } finally {
              setRecovering(false);
            }
          }}
          disabled={recovering}
          className="w-full justify-start"
        >
          {recovering ? "Recovering..." : "Recover Stranded Tokens"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Restores tokens stored in the local couch during interrupted
          operations.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </details>
  );
}

export function WalletSettings({ wallet }: { wallet: Wallet }) {
  if (!wallet.unlocked) {
    return (
      <p className="text-muted-foreground text-center py-4">
        Unlock your wallet to access settings
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <MintManager wallet={wallet} />
      <RelayManager wallet={wallet} />
      <BackupTool wallet={wallet} />
      <ToolsSection />
    </div>
  );
}
