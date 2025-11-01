import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { Button } from "./ui/button";
import { BitcoinFillIcon } from "./ui/icons/akar-icons-bitcoin-fill";
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
  } = useWalletStore();
  const navigate = useNavigate();

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
    <Button variant="outline" onClick={handleClick}>
      <BitcoinFillIcon className="w-4 h-4 mr-2" />
      <span className="font-semibold text-sm">
        {new Intl.NumberFormat().format(balance)}
      </span>
      <span className="text-xs text-muted-foreground ml-1">sats</span>
    </Button>
  );
}
