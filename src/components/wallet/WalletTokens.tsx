import { use$ } from "applesauce-react/hooks";
import { useMemo, useState, useCallback } from "react";
import type { Wallet, WalletToken } from "applesauce-wallet/casts";
import { getEncodedToken } from "@cashu/cashu-ts";
import { Button } from "../ui/button";

function TokenEntry({ token }: { token: WalletToken }) {
  const meta = use$(token.meta$);
  const amount = use$(token.amount$);
  const [copied, setCopied] = useState(false);

  const encodedToken = useMemo(() => {
    if (!token.mint || !token.proofs) return undefined;
    return getEncodedToken({ mint: token.mint, proofs: token.proofs, unit: "sat" });
  }, [token.mint, token.proofs]);

  const handleCopy = useCallback(() => {
    if (!encodedToken) return;
    navigator.clipboard.writeText(encodedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [encodedToken]);

  if (!token.unlocked || !meta) {
    return (
      <div className="py-2 border-b text-muted-foreground text-sm">
        Locked token
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="min-w-0">
        <span className="font-medium">{amount} sats</span>
        {meta.mint && (
          <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
            {meta.mint}
          </div>
        )}
      </div>
      {encodedToken && (
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </Button>
      )}
    </div>
  );
}

export function WalletTokens({ wallet }: { wallet: Wallet }) {
  const tokens = use$(wallet.tokens$);

  if (!wallet.unlocked) {
    return (
      <p className="text-muted-foreground text-center py-4">
        Unlock your wallet to view tokens
      </p>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-4">No tokens yet</p>
    );
  }

  return (
    <div>
      {tokens.map((token) => (
        <TokenEntry key={token.id} token={token} />
      ))}
    </div>
  );
}
