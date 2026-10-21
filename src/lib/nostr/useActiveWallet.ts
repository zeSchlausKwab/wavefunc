import { useCallback, useEffect, useState } from "react";
import type { IAccount } from "applesauce-accounts";
import { WavefuncWallet } from "./wallet";
import { getWalletRelayUrls } from "../../config/nostr";
import { couch, eventStore, migrateLegacyCouch, relayPool } from "./store";
import { withRelayAuthentication } from "./transport";

/** Owns one wallet session per account, including startup failure and retry. */
export function useActiveWallet(account: IAccount | null | undefined) {
  const [session, setSession] = useState<{
    account: IAccount;
    wallet: WavefuncWallet;
    error: Error | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const restart = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (!account) { setSession(null); return; }
    const instance = new WavefuncWallet({
      pubkey: account.pubkey,
      signer: account.signer,
      pool: withRelayAuthentication(relayPool, account.signer, account.pubkey),
      eventStore, couch, relays: getWalletRelayUrls(), autoUnlock: true,
    });
    let cancelled = false;
    setSession({ account, wallet: instance, error: null });
    void migrateLegacyCouch().then(async () => {
      if (!cancelled) await instance.start();
    }).catch(cause => {
      if (!cancelled) setSession({ account, wallet: instance,
        error: cause instanceof Error ? cause : new Error(String(cause)) });
    });
    return () => { cancelled = true; instance.stop(); };
  }, [account, attempt]);
  // A different signer for the same pubkey also owns a different wallet session.
  const current = session?.account === account ? session : null;
  return { wallet: current?.wallet ?? null, error: current?.error ?? null, restart };
}
