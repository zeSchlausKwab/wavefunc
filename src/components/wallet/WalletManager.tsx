import { use$ } from "applesauce-react/hooks";
import { useEffect, useRef, useState } from "react";
import type { User } from "applesauce-common/casts";
import { actions } from "../../lib/nostr/store";
import { UnlockWallet } from "applesauce-wallet/actions";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { WalletOverview } from "./WalletOverview";
import { WalletTokens } from "./WalletTokens";
import { WalletSettings } from "./WalletSettings";
import { WalletHistory } from "./WalletHistory";
import { CreateWalletView } from "./CreateWallet";

type Tab = "overview" | "history" | "tokens" | "settings";

function WalletTabs({ user, compact }: { user: User; compact?: boolean }) {
  const wallet = use$(user.wallet$);
  const tokens = use$(wallet?.tokens$);
  const history = use$(wallet?.history$);
  const [tab, setTab] = useState<Tab>("overview");
  const unlocking = useRef(false);

  // Auto-unlock wallet when events arrive
  useEffect(() => {
    if (unlocking.current || !wallet) return;

    let needsUnlock = false;
    if (wallet.unlocked === false) needsUnlock = true;
    if (tokens?.some((t) => t.unlocked === false)) needsUnlock = true;
    if (history?.some((h) => h.unlocked === false)) needsUnlock = true;

    if (needsUnlock) {
      unlocking.current = true;
      actions
        .run(UnlockWallet, { history: true, tokens: true })
        .catch((err) => console.error("Auto-unlock failed:", err))
        .finally(() => {
          unlocking.current = false;
        });
    }
  }, [wallet?.unlocked, tokens?.length, history?.length]);

  if (!wallet) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "history", label: "History" },
    { id: "tokens", label: "Tokens" },
    { id: "settings", label: "Settings" },
  ];

  const content = (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
              compact ? "text-xs" : "text-sm"
            } ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <WalletOverview wallet={wallet} />}
      {tab === "history" && <WalletHistory wallet={wallet} />}
      {tab === "tokens" && <WalletTokens wallet={wallet} />}
      {tab === "settings" && <WalletSettings wallet={wallet} />}
    </div>
  );

  if (compact) {
    return <div className="p-4">{content}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">NIP-60 Wallet</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export function WalletView({
  user,
  compact,
}: {
  user: User;
  compact?: boolean;
}) {
  const wallet = use$(user.wallet$);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (wallet) setLoading(false);
  }, [wallet]);

  if (loading && !wallet) {
    const spinner = (
      <div className="text-center py-8 text-muted-foreground">
        <div className="animate-pulse">Checking for wallet on relays...</div>
      </div>
    );
    if (compact) return <div className="p-4">{spinner}</div>;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">NIP-60 Wallet</CardTitle>
        </CardHeader>
        <CardContent>{spinner}</CardContent>
      </Card>
    );
  }

  if (!wallet) {
    if (compact) {
      return (
        <div className="p-4 text-center space-y-2">
          <p className="text-sm font-medium">No wallet found</p>
          <p className="text-xs text-muted-foreground">
            Close this and scroll down to create one
          </p>
        </div>
      );
    }
    return <CreateWalletView />;
  }

  return <WalletTabs user={user} compact={compact} />;
}
