import { Coins, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

interface BalanceCardProps {
  balance: number;
  mintBalances: Record<string, number>;
  mints?: string[];
  isLoadingBalance: boolean;
  onRefresh: () => void;
}

export function BalanceCard({
  balance,
  mintBalances,
  mints = [],
  isLoadingBalance,
  onRefresh,
}: BalanceCardProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-background p-8">
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Coins className="w-4 h-4" />
            <span>Total Balance</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoadingBalance}
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoadingBalance ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <div className="flex items-baseline gap-2">
          <h2 className="text-5xl font-bold tracking-tight">
            {formatAmount(balance)}
          </h2>
          <span className="text-2xl text-muted-foreground">sats</span>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Balance by mint:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {mints.map((mint, idx) => {
              const mintBalance = mintBalances[mint] || 0;
              return (
                <div
                  key={idx}
                  className="text-xs px-3 py-2 bg-background/50 backdrop-blur-sm rounded-md border border-border/50 flex justify-between items-center"
                >
                  <span className="truncate flex-1">
                    {new URL(mint).hostname}
                  </span>
                  <span className="font-semibold ml-2">
                    {formatAmount(mintBalance)} sats
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}