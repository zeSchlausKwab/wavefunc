import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useState } from "react";
import { Button } from "./ui/button";
import { BitcoinFillIcon } from "./ui/icons/akar-icons-bitcoin-fill";
import { useWalletStore } from "../stores/walletStore";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

export function WalletButton() {
  const currentUser = useNDKCurrentUser();
  const {
    cashuBalance,
    nwcBalance,
    activeWalletType,
    cashuConnection,
    nwcConnection,
    nwcWallet,
    updateNWCBalance,
  } = useWalletStore();
  const navigate = useNavigate();
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!currentUser) {
    return (
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground text-sm">
          Please log in to view wallet
        </p>
      </div>
    );
  }

  const handleClick = () => {
    // Navigate to wallet settings
    navigate({ to: "/settings" });
  };

  const handleRefreshBalance = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation

    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      if (activeWalletType === "nwc" && nwcWallet && nwcWallet.updateBalance) {
        await nwcWallet.updateBalance();
        const balance = nwcWallet.balance;
        if (balance && typeof balance.amount === "number") {
          updateNWCBalance(balance.amount);
        }
      }
      // TODO: Add cashu balance refresh when implemented
    } catch (err) {
      console.error("Failed to refresh balance:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get the current balance based on active wallet type
  const getBalance = () => {
    if (activeWalletType === "cashu" && cashuConnection) {
      return cashuBalance;
    }
    if (activeWalletType === "nwc" && nwcConnection) {
      return nwcBalance;
    }
    return 0;
  };

  const balance = getBalance();
  const hasWallet = cashuConnection || nwcConnection;

  if (!hasWallet) {
    return (
      <Button variant="outline" onClick={handleClick}>
        <BitcoinFillIcon className="w-4 h-4 mr-2" />
        <span className="text-sm">Connect Wallet</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={handleClick}>
        <BitcoinFillIcon className="w-4 h-4 mr-2" />
        <span className="font-semibold text-sm">
          {new Intl.NumberFormat().format(balance)}
        </span>
        <span className="text-xs text-muted-foreground ml-1">sats</span>
      </Button>
      {activeWalletType === "nwc" && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefreshBalance}
          disabled={isRefreshing}
          title="Refresh balance"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </Button>
      )}
    </div>
  );
}
