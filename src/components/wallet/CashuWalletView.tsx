import { useState, useEffect } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { QRCodeSVG } from "qrcode.react";
import {
  Coins,
  TrendingUp,
  TrendingDown,
  QrCode,
  Copy,
  Check,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Wallet,
  RefreshCw,
  ExternalLink,
  Settings,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useWalletStore } from "../../stores/walletStore";
import { formatDistanceToNow } from "date-fns";

interface Transaction {
  id: string;
  type: "deposit" | "withdraw" | "send" | "receive";
  amount: number;
  timestamp: number;
  status: "pending" | "completed" | "failed";
  memo?: string;
  mint?: string;
}

export function CashuWalletView() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { cashuWallet, cashuConnection, updateCashuBalance } = useWalletStore();

  const [balance, setBalance] = useState<number>(0);
  const [mintBalances, setMintBalances] = useState<Record<string, number>>({});
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositInvoice, setDepositInvoice] = useState<string | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  // Load balance and transactions on mount
  useEffect(() => {
    loadBalance();
    loadTransactions();
  }, [cashuWallet]);

  // Listen for wallet balance updates
  useEffect(() => {
    if (!cashuWallet) return;

    const wallet = cashuWallet as NDKCashuWallet;

    // Listen for balance updates
    const handleBalanceUpdate = (newBalance?: { amount: number }) => {
      if (newBalance) {
        setBalance(newBalance.amount);
        updateCashuBalance(newBalance.amount);
      }
    };

    wallet.on("balance_updated", handleBalanceUpdate);

    return () => {
      wallet.off("balance_updated", handleBalanceUpdate);
    };
  }, [cashuWallet, updateCashuBalance]);

  const loadBalance = async () => {
    if (!cashuWallet) return;

    setIsLoadingBalance(true);
    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get balance using the wallet state methods
      const totalBal = wallet.state?.getBalance() || 0;
      const mintBals = wallet.state?.getMintsBalance() || {};

      setBalance(totalBal);
      setMintBalances(mintBals);
      updateCashuBalance(totalBal);
    } catch (error) {
      console.error("Failed to load balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const loadTransactions = async () => {
    if (!cashuWallet || !ndk || !currentUser) return;

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Fetch token events (kind 7375) - these represent actual token movements
      const filter = {
        kinds: [7375], // NDKCashuToken events
        authors: [currentUser.pubkey],
      };

      const events = await ndk.fetchEvents(filter, { groupable: false });

      const txs: Transaction[] = [];

      for (const event of Array.from(events)) {
        try {
          // Decrypt the event content
          await event.decrypt();

          // Parse the token data
          const content = JSON.parse(event.content || "{}");
          const proofs = content.proofs || [];

          // Calculate amount from proofs
          const amount = proofs.reduce(
            (sum: number, proof: any) => sum + (proof.amount || 0),
            0
          );

          // Get metadata from tags
          const mint = event.tagValue("mint") || cashuConnection?.mints?.[0];
          const direction = event.tagValue("direction") || "unknown";
          const memo =
            event.tagValue("memo") || event.tagValue("description") || "Token";

          // Determine transaction type
          let txType: "deposit" | "withdraw" | "send" | "receive" = "receive";
          if (
            memo.toLowerCase().includes("payment") ||
            memo.toLowerCase().includes("withdraw")
          ) {
            txType = "withdraw";
          } else if (memo.toLowerCase().includes("deposit")) {
            txType = "deposit";
          }

          txs.push({
            id: event.id,
            type: txType,
            amount: txType === "withdraw" ? -amount : amount,
            timestamp: (event.created_at || 0) * 1000,
            status: "completed",
            memo,
            mint,
          });
        } catch (err) {
          console.error("Failed to parse token event:", err, event);
        }
      }

      // Sort by timestamp, newest first
      txs.sort((a, b) => b.timestamp - a.timestamp);

      setTransactions(txs);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!cashuWallet || !depositAmount) return;

    const amount = parseInt(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError("Please enter a valid amount");
      return;
    }

    setIsGeneratingInvoice(true);
    setDepositError(null);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Get the first mint
      const mints = cashuConnection?.mints || [];
      if (mints.length === 0) {
        throw new Error("No mints configured");
      }

      // Generate deposit invoice
      const deposit = wallet.deposit(amount, mints[0]);

      // Start the deposit and get the invoice
      const invoice = await deposit.start();
      setDepositInvoice(invoice);

      // Listen for success
      deposit.on("success", async () => {
        await loadBalance();
        await loadTransactions();
      });

      deposit.on("error", (error) => {
        setDepositError(error);
      });

      // Add pending transaction
      const newTransaction: Transaction = {
        id: Date.now().toString(),
        type: "deposit",
        amount,
        timestamp: Date.now(),
        status: "pending",
        mint: mints[0],
      };
      setTransactions([newTransaction, ...transactions]);
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      setDepositError(
        error instanceof Error ? error.message : "Failed to generate invoice"
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const handleWithdraw = async () => {
    if (!cashuWallet || !withdrawAmount || !withdrawAddress) return;

    const amount = parseInt(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError("Please enter a valid amount");
      return;
    }

    if (amount > balance) {
      setWithdrawError("Insufficient balance");
      return;
    }

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(false);

    try {
      const wallet = cashuWallet as NDKCashuWallet;

      // Withdraw to Lightning address or invoice
      await wallet.lnPay({ pr: withdrawAddress });

      // Refresh balance and transactions
      await loadBalance();
      await loadTransactions();

      setWithdrawSuccess(true);
      setWithdrawAmount("");
      setWithdrawAddress("");
    } catch (error) {
      console.error("Failed to withdraw:", error);
      setWithdrawError(
        error instanceof Error ? error.message : "Failed to withdraw"
      );
    } finally {
      setIsWithdrawing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat().format(amount);
  };

  if (!cashuWallet) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No Cashu wallet connected</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Card */}
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
              onClick={loadBalance}
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
              {cashuConnection?.mints?.map((mint, idx) => {
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

      {/* Action Tabs */}
      <Tabs defaultValue="deposit" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deposit">
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            Deposit
          </TabsTrigger>
          <TabsTrigger value="withdraw">
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            Withdraw
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Deposit Tab */}
        <TabsContent value="deposit" className="space-y-4">
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5" />
                Deposit Sats
              </h3>
              <p className="text-sm text-muted-foreground">
                Generate a Lightning invoice to deposit sats into your Cashu
                wallet
              </p>
            </div>

            {!depositInvoice ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="deposit-amount">Amount (sats)</Label>
                  <Input
                    id="deposit-amount"
                    type="number"
                    placeholder="1000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div className="flex gap-2">
                  {[1000, 5000, 10000, 50000].map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => setDepositAmount(amt.toString())}
                    >
                      {formatAmount(amt)}
                    </Button>
                  ))}
                </div>

                {depositError && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                    {depositError}
                  </div>
                )}

                <Button
                  onClick={handleGenerateInvoice}
                  disabled={isGeneratingInvoice || !depositAmount}
                  className="w-full"
                >
                  {isGeneratingInvoice ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generating Invoice...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Generate Invoice
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center p-6 bg-white rounded-lg">
                  <QRCodeSVG value={depositInvoice} size={256} level="M" />
                </div>

                <div className="space-y-2">
                  <Label>Lightning Invoice</Label>
                  <div className="flex gap-2">
                    <Input
                      value={depositInvoice}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(depositInvoice)}
                    >
                      {copied ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="p-3 text-sm bg-blue-500/10 rounded-md border border-blue-500/20">
                  <p className="text-blue-600 dark:text-blue-400">
                    Scan this QR code or copy the invoice to pay with any
                    Lightning wallet
                  </p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setDepositInvoice(null);
                    setDepositAmount("");
                  }}
                  className="w-full"
                >
                  Generate New Invoice
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Withdraw Tab */}
        <TabsContent value="withdraw" className="space-y-4">
          <div className="rounded-lg border border-border p-6 space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ArrowUpFromLine className="w-5 h-5" />
                Withdraw Sats
              </h3>
              <p className="text-sm text-muted-foreground">
                Send sats from your Cashu wallet to a Lightning address or
                invoice
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-amount">Amount (sats)</Label>
              <Input
                id="withdraw-amount"
                type="number"
                placeholder="1000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatAmount(balance)} sats
              </p>
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex gap-2">
              {[1000, 5000, 10000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setWithdrawAmount(amt.toString())}
                  disabled={amt > balance}
                >
                  {formatAmount(amt)}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWithdrawAmount(balance.toString())}
              >
                Max
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdraw-address">
                Lightning Address or Invoice
              </Label>
              <Input
                id="withdraw-address"
                type="text"
                placeholder="user@getalby.com or lnbc..."
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
              />
            </div>

            {withdrawError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {withdrawError}
              </div>
            )}

            {withdrawSuccess && (
              <div className="p-3 text-sm text-green-600 bg-green-600/10 rounded-md border border-green-600/20">
                Withdrawal successful! Your sats are on the way.
              </div>
            )}

            <Button
              onClick={handleWithdraw}
              disabled={isWithdrawing || !withdrawAmount || !withdrawAddress}
              className="w-full"
            >
              {isWithdrawing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  Withdraw{" "}
                  {withdrawAmount
                    ? formatAmount(parseInt(withdrawAmount))
                    : ""}{" "}
                  sats
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="rounded-lg border border-border p-6 space-y-4">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
