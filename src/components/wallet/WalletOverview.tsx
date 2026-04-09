import { use$ } from "applesauce-react/hooks";
import { useState } from "react";
import type { Wallet } from "applesauce-wallet/casts";
import { UnlockWallet } from "applesauce-wallet/actions";
import { actions } from "../../lib/nostr/store";
import { Button } from "../ui/button";
import { SendCashu } from "./flows/SendCashu";
import { PayLightning } from "./flows/PayLightning";
import { ReceiveCashu } from "./flows/ReceiveCashu";
import { ReceiveLightning } from "./flows/ReceiveLightning";

type Action =
  | "none"
  | "send-cashu"
  | "pay-ln"
  | "receive-cashu"
  | "receive-ln";

const ACTIONS: Array<{
  id: Exclude<Action, "none">;
  label: string;
  icon: string;
  kind: "withdraw" | "deposit";
}> = [
  { id: "send-cashu", label: "Withdraw Cashu", icon: "🥜", kind: "withdraw" },
  { id: "pay-ln", label: "Withdraw Lightning", icon: "⚡", kind: "withdraw" },
  { id: "receive-cashu", label: "Deposit Cashu", icon: "🥜", kind: "deposit" },
  { id: "receive-ln", label: "Deposit Lightning", icon: "⚡", kind: "deposit" },
];

export function WalletOverview({ wallet }: { wallet: Wallet }) {
  const balance = use$(wallet.balance$);
  const [unlocking, setUnlocking] = useState(false);
  const [action, setAction] = useState<Action>("none");

  if (!wallet.unlocked) {
    return (
      <div className="text-center space-y-3 py-6">
        <h2 className="text-lg font-semibold">Wallet Locked</h2>
        <Button
          onClick={async () => {
            setUnlocking(true);
            try {
              await actions.run(UnlockWallet, { history: true, tokens: true });
            } catch (err) {
              console.error("Failed to unlock:", err);
            } finally {
              setUnlocking(false);
            }
          }}
          disabled={unlocking}
          size="sm"
        >
          {unlocking ? "Unlocking..." : "Unlock Wallet"}
        </Button>
      </div>
    );
  }

  const totalBalance = balance
    ? Object.values(balance).reduce((sum, amount) => sum + amount, 0)
    : 0;

  const activeAction = ACTIONS.find((a) => a.id === action);

  const close = () => setAction("none");

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className="text-center">
        <div className="text-3xl font-bold tabular-nums">
          {totalBalance.toLocaleString()}
          <span className="text-base font-normal text-muted-foreground ml-1.5">
            sats
          </span>
        </div>
      </div>

      {/* 2x2 action grid - single line per tile */}
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => {
          const isActive = action === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAction(isActive ? "none" : a.id)}
              className={`flex items-center gap-1.5 px-2.5 h-9 rounded-lg border text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
              }`}
            >
              <span className="text-sm leading-none">
                {a.kind === "withdraw" ? "↑" : "↓"}
              </span>
              <span className="text-sm leading-none">{a.icon}</span>
              <span className="truncate">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active flow */}
      {activeAction && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-2">
              <span>{activeAction.icon}</span>
              <span>{activeAction.label}</span>
            </div>
            <button
              onClick={close}
              className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {action === "send-cashu" && (
            <SendCashu wallet={wallet} onDone={close} />
          )}
          {action === "pay-ln" && <PayLightning wallet={wallet} onDone={close} />}
          {action === "receive-cashu" && (
            <ReceiveCashu wallet={wallet} onDone={close} />
          )}
          {action === "receive-ln" && (
            <ReceiveLightning wallet={wallet} onDone={close} />
          )}
        </div>
      )}

      {/* Balance by mint - collapsed by default */}
      {balance && Object.keys(balance).length > 0 && !activeAction && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none flex items-center gap-1">
            <span className="transition-transform group-open:rotate-90">›</span>
            Balance by mint ({Object.keys(balance).length})
          </summary>
          <div className="mt-2 space-y-1">
            {Object.entries(balance).map(([mint, amount]) => (
              <div
                key={mint}
                className="flex justify-between items-center text-xs py-1.5 px-2 rounded bg-muted/30"
              >
                <span className="font-mono truncate text-muted-foreground">
                  {new URL(mint).hostname}
                </span>
                <span className="font-medium tabular-nums ml-2">
                  {amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
