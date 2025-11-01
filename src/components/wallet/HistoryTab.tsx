import { History, TrendingUp, TrendingDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface Transaction {
  id: string;
  type: "deposit" | "withdraw" | "send" | "receive";
  amount: number;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  memo?: string;
  mint?: string;
}

interface HistoryTabProps {
  transactions: Transaction[];
}

export function HistoryTab({ transactions }: HistoryTabProps) {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  return (
    <div className="space-y-4 max-w-full">
      <div className="rounded-lg border border-border p-6 space-y-4 max-w-full overflow-hidden">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Transaction History
          </h3>
          <p className="text-sm text-muted-foreground">
            View all your Cashu wallet transactions
          </p>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No transactions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your transaction history will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`p-2 rounded-full ${
                    tx.type === "deposit" || tx.type === "receive"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-orange-500/10 text-orange-600"
                  }`}
                >
                  {tx.type === "deposit" || tx.type === "receive" ? (
                    <TrendingDown className="w-5 h-5" />
                  ) : (
                    <TrendingUp className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium capitalize">{tx.type}</h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        tx.status === "completed"
                          ? "bg-green-500/10 text-green-600"
                          : tx.status === "pending"
                          ? "bg-yellow-500/10 text-yellow-600"
                          : "bg-red-500/10 text-red-600"
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
                  </p>
                  {tx.memo && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                      {tx.memo}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p
                    className={`text-lg font-semibold ${
                      tx.amount > 0 ? "text-green-600" : "text-orange-600"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {formatAmount(Math.abs(tx.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground">sats</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}