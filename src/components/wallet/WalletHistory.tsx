import { use$ } from "applesauce-react/hooks";
import { useMemo } from "react";
import type { Wallet, WalletHistory as HistoryCast } from "applesauce-wallet/casts";

function formatTime(date: Date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function HistoryRow({ entry }: { entry: HistoryCast }) {
  const meta = use$(entry.meta$);

  if (!entry.unlocked || !meta) {
    return (
      <div className="py-3 border-b text-muted-foreground text-sm flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
          🔒
        </div>
        <span>Locked entry</span>
      </div>
    );
  }

  const isIn = meta.direction === "in";
  const mintHost = meta.mint ? new URL(meta.mint).hostname : null;

  return (
    <div className="py-3 border-b last:border-0">
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
            isIn
              ? "bg-green-500/10 text-green-600"
              : "bg-orange-500/10 text-orange-600"
          }`}
        >
          {isIn ? "↓" : "↑"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">
              {isIn ? "Received" : "Sent"}
            </span>
            <span
              className={`font-semibold tabular-nums ${
                isIn ? "text-green-600" : "text-orange-600"
              }`}
            >
              {isIn ? "+" : "−"}
              {meta.amount} sats
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            {mintHost && (
              <span className="text-xs text-muted-foreground font-mono truncate">
                {mintHost}
              </span>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatTime(entry.createdAt)}
            </span>
          </div>
          {meta.fee && meta.fee > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              Fee: {meta.fee} sats
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function WalletHistory({ wallet }: { wallet: Wallet }) {
  const history = use$(wallet.history$);

  const { entries, stats } = useMemo(() => {
    if (!history) return { entries: [], stats: null };

    // Sort newest first
    const sorted = [...history].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    // Aggregate stats from unlocked entries
    let totalIn = 0;
    let totalOut = 0;
    let totalFees = 0;
    let inCount = 0;
    let outCount = 0;

    for (const entry of sorted) {
      if (!entry.unlocked) continue;
      const meta = entry.meta;
      if (!meta) continue;
      if (meta.direction === "in") {
        totalIn += meta.amount;
        inCount++;
      } else {
        totalOut += meta.amount;
        outCount++;
      }
      totalFees += meta.fee || 0;
    }

    return {
      entries: sorted,
      stats: { totalIn, totalOut, totalFees, inCount, outCount },
    };
  }, [history]);

  if (!wallet.unlocked) {
    return (
      <p className="text-muted-foreground text-center py-4">
        Unlock your wallet to view history
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-6 text-sm">
        No transactions yet
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {stats && (stats.inCount > 0 || stats.outCount > 0) && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/50 rounded p-2">
            <div className="text-[10px] text-muted-foreground uppercase">
              Received
            </div>
            <div className="text-sm font-semibold text-green-600">
              +{stats.totalIn}
            </div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-[10px] text-muted-foreground uppercase">
              Sent
            </div>
            <div className="text-sm font-semibold text-orange-600">
              −{stats.totalOut}
            </div>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <div className="text-[10px] text-muted-foreground uppercase">
              Fees
            </div>
            <div className="text-sm font-semibold">{stats.totalFees}</div>
          </div>
        </div>
      )}

      <div>
        {entries.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
