import { use$ } from "applesauce-react/hooks";
import { WalletStatus, type NutWallet } from "applesauce-wallet/wallet";
import { useWavefuncNostr } from "../../lib/nostr/runtime";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { CreateWalletView } from "./CreateWallet";
import { WalletHistory } from "./WalletHistory";
import { WalletOverview } from "./WalletOverview";
import { WalletSettings } from "./WalletSettings";
import { WalletTokens } from "./WalletTokens";
import { useState } from "react";

type Tab = "overview" | "history" | "tokens" | "settings";

function WalletTabs({ wallet, compact }: { wallet: NutWallet; compact?: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "history", label: "History" },
    { id: "tokens", label: "Tokens" },
    { id: "settings", label: "Settings" },
  ];

  const content = (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
              compact ? "text-xs" : "text-sm"
            } ${
              tab === item.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <WalletOverview wallet={wallet} />}
      {tab === "history" && <WalletHistory wallet={wallet} />}
      {tab === "tokens" && <WalletTokens wallet={wallet} />}
      {tab === "settings" && <WalletSettings wallet={wallet} />}
    </div>
  );

  if (compact) return <div className="p-4">{content}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">NIP-60 Wallet</CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

export function WalletView({ compact }: { compact?: boolean }) {
  const { wallet } = useWavefuncNostr();
  const status = use$(wallet?.status$) ?? WalletStatus.Idle;
  const syncing = use$(wallet?.syncingState$) ?? false;
  const error = use$(wallet?.errorState$);

  if (!wallet || status === WalletStatus.Idle || status === WalletStatus.Loading) {
    const message = (
      <div className="text-center py-8 text-muted-foreground">
        <div className="animate-pulse">Loading wallet from relays...</div>
      </div>
    );
    if (compact) return <div className="p-4">{message}</div>;
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">NIP-60 Wallet</CardTitle></CardHeader>
        <CardContent>{message}</CardContent>
      </Card>
    );
  }

  if (status === WalletStatus.Missing) {
    return <CreateWalletView wallet={wallet} compact={compact} />;
  }

  return (
    <>
      {(syncing || error) && (
        <div className="px-4 pt-3 text-xs text-muted-foreground">
          {syncing ? "Synchronizing wallet relays..." : error?.message}
        </div>
      )}
      <WalletTabs wallet={wallet} compact={compact} />
    </>
  );
}
