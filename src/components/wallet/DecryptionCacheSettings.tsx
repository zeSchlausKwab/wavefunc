import { useRef, useState } from "react";
import { use$ } from "applesauce-react/hooks";
import type { WavefuncWallet } from "../../lib/nostr/wallet";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
export function DecryptionCacheSettings({
  wallet,
}: {
  wallet: WavefuncWallet;
}) {
  const cache = wallet.protectedCache;
  const state = use$(cache?.state$);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  if (!cache) return null;
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPassphrase("");
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 border p-3">
      <h4 className="font-semibold text-sm">Faster wallet unlock</h4>
      <p className="text-xs text-muted-foreground">
        Optionally cache decrypted wallet events on this device, encrypted with
        a separate passphrase. Unlock the cache each session to reduce signer
        requests. It expires entries after 30 days and is separate from your
        recovery backups. Keep a strong passphrase; erasing this cache does not
        erase funds.
      </p>
      <p role="status" className="text-xs">
        Cache: {state}
      </p>
      {["disabled", "locked"].includes(state ?? "") && (
        <div className="space-y-2">
          <Input
            aria-label="Decryption cache passphrase"
            type="password"
            autoComplete="off"
            placeholder="Passphrase (at least 12 characters)"
            value={passphrase}
            disabled={busy}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || passphrase.length < 12}
            onClick={() => run(() => wallet.unlockDecryptionCache(passphrase))}
          >
            {state === "disabled" ? "Enable encrypted cache" : "Unlock cache"}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "unlocked" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              cache.lock();
              setPassphrase("");
            }}
          >
            Lock cache
          </Button>
        )}
        {["locked", "unlocked"].includes(state ?? "") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => cache.clear())}
          >
            Erase cache
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
