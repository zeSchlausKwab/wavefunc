import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useState } from "react";
import { useWalletStore } from "../stores/walletStore";
import { useNavigate } from "@tanstack/react-router";

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

  if (!currentUser) return null;

  const handleClick = () => navigate({ to: "/settings" });

  const handleRefreshBalance = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
    } catch (err) {
      console.error("Failed to refresh balance:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getBalance = () => {
    if (activeWalletType === "cashu" && cashuConnection) return cashuBalance;
    if (activeWalletType === "nwc" && nwcConnection) return nwcBalance;
    return 0;
  };

  const balance = getBalance();
  const hasWallet = cashuConnection || nwcConnection;

  if (!hasWallet) {
    return (
      <button
        onClick={handleClick}
        className="h-full px-3 flex items-center gap-1.5 border-r-4 border-on-background hover:bg-surface-container-high transition-colors"
        title="Connect wallet"
      >
        <span className="material-symbols-outlined text-[16px]">currency_bitcoin</span>
        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
          WALLET
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-full border-r-4 border-on-background">
      <button
        onClick={handleClick}
        className="h-full px-3 flex items-center gap-1.5 hover:bg-surface-container-high transition-colors"
        title="Wallet settings"
      >
        <span className="material-symbols-outlined text-[14px] text-primary">currency_bitcoin</span>
        <span className="text-[10px] font-black font-mono tracking-tight">
          {new Intl.NumberFormat().format(balance)}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/50 hidden sm:inline">
          SATS
        </span>
      </button>
      {activeWalletType === "nwc" && (
        <button
          onClick={handleRefreshBalance}
          disabled={isRefreshing}
          className="h-full px-2 hover:bg-surface-container-high transition-colors border-l-2 border-on-background/20"
          title="Refresh balance"
        >
          <span
            className={`material-symbols-outlined text-[14px] text-on-background/50 ${isRefreshing ? "animate-spin" : ""}`}
          >
            sync
          </span>
        </button>
      )}
    </div>
  );
}
