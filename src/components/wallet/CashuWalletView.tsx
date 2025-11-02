import { useState, useEffect } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Wallet,
  Settings,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useWalletStore } from "../../stores/walletStore";
import { BalanceCard } from "./BalanceCard";
import { DepositTab } from "./DepositTab";
import { WithdrawTab } from "./WithdrawTab";
import { HistoryTab, type Transaction } from "./HistoryTab";
import { SettingsTab } from "./SettingsTab";
import { getUnredeemedTokens } from "../../lib/sentTokensDb";
import { useMedia } from "react-use";

export function CashuWalletView() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const {
    cashuWallet,
    cashuConnection,
    cashuBalance,
    updateCashuBalance,
    updateCashuConnection,
  } = useWalletStore();

  const isMobile = useMedia("(max-width: 768px)");

  const [balance, setBalance] = useState<number>(0);
  const [mintBalances, setMintBalances] = useState<Record<string, number>>({});
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Load balance and transactions on mount
  useEffect(() => {
    loadBalance();
    loadTransactions();
  }, [cashuWallet]);

  // Listen for wallet balance updates from the store
  useEffect(() => {
    // When the store balance changes, update local state and reload breakdown
    if (cashuBalance !== balance && cashuWallet) {
      setBalance(cashuBalance);
      loadBalance(); // Reload to get per-mint breakdown
    }
  }, [cashuBalance]);

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

      // Add sent tokens from local storage
      const sentTokens = getUnredeemedTokens();
      for (const sentToken of sentTokens) {
        txs.push({
          id: `sent-${sentToken.id}`,
          type: "send",
          amount: -sentToken.amount,
          timestamp: sentToken.createdAt,
          status: "pending", // Unredeemed tokens are pending
          memo: sentToken.description || `Sent token #${sentToken.id}`,
          mint: sentToken.mint,
        });
      }

      // Sort by timestamp, newest first
      txs.sort((a, b) => b.timestamp - a.timestamp);

      setTransactions(txs);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    }
  };

  const handleSaveSettings = (
    mints: string[],
    relays: string[],
    primaryMint: string
  ) => {
    updateCashuConnection(mints, relays, primaryMint);
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
    <div className="space-y-6 max-w-full overflow-hidden">
      {/* Balance Card */}
      <BalanceCard
        balance={balance}
        mintBalances={mintBalances}
        mints={cashuConnection?.mints}
        isLoadingBalance={isLoadingBalance}
        onRefresh={loadBalance}
      />

      {/* Action Tabs */}
      <Tabs defaultValue="deposit" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="deposit">
            <ArrowDownToLine className="w-4 h-4 mr-2" />
            {!isMobile && "Deposit"}
          </TabsTrigger>
          <TabsTrigger value="withdraw">
            <ArrowUpFromLine className="w-4 h-4 mr-2" />
            {!isMobile && "Withdraw"}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            {!isMobile && "History"}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            {!isMobile && "Settings"}
          </TabsTrigger>
        </TabsList>

        {/* Deposit Tab */}
        <TabsContent value="deposit" className="space-y-4 max-w-full">
          <DepositTab
            cashuWallet={cashuWallet as NDKCashuWallet}
            balance={balance}
            cashuConnection={cashuConnection || undefined}
            onBalanceUpdate={loadBalance}
            onTransactionsUpdate={loadTransactions}
          />
        </TabsContent>

        {/* Withdraw Tab */}
        <TabsContent value="withdraw" className="space-y-4 max-w-full">
          <WithdrawTab
            cashuWallet={cashuWallet as NDKCashuWallet}
            balance={balance}
            cashuConnection={cashuConnection || undefined}
            onBalanceUpdate={loadBalance}
            onTransactionsUpdate={loadTransactions}
          />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 max-w-full">
          <HistoryTab
            transactions={transactions}
            cashuWallet={cashuWallet as NDKCashuWallet}
            onBalanceUpdate={loadBalance}
            onTransactionsUpdate={loadTransactions}
          />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4 max-w-full">
          <SettingsTab
            cashuConnection={cashuConnection || undefined}
            onSaveSettings={handleSaveSettings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
