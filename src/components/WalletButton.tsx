import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { castUser } from "applesauce-common/casts";
import { use$ } from "applesauce-react/hooks";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";

/**
 * Header wallet pill. Shows the total NIP-60 cashu balance summed across
 * mints, or a "WALLET" prompt if no wallet exists yet. Reads the balance
 * straight from the User cast (`wallet$ → balance$`) so it stays reactive
 * to mint/redeem operations without going through any zustand store.
 */
export function WalletButton() {
  const currentUser = useCurrentAccount();
  const { eventStore } = useWavefuncNostr();
  const navigate = useNavigate();

  const user = useMemo(
    () => (currentUser ? castUser(currentUser.pubkey, eventStore) : null),
    [currentUser?.pubkey, eventStore]
  );

  const wallet = use$(user?.wallet$);
  const balance = use$(wallet?.balance$);

  if (!currentUser) return null;

  const handleClick = () => navigate({ to: "/settings" });

  const totalBalance = balance
    ? Object.values(balance).reduce((sum, amount) => sum + amount, 0)
    : 0;

  if (!wallet) {
    return (
      <button
        onClick={handleClick}
        className="h-full px-3 flex items-center gap-1.5 border-r-4 border-on-background hover:bg-surface-container-high transition-colors"
        title="Connect wallet"
      >
        <span className="material-symbols-outlined text-[16px]">
          currency_bitcoin
        </span>
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
        <span className="material-symbols-outlined text-[14px] text-primary">
          currency_bitcoin
        </span>
        <span className="text-[10px] font-black font-mono tracking-tight">
          {new Intl.NumberFormat().format(totalBalance)}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/50 hidden sm:inline">
          SATS
        </span>
      </button>
    </div>
  );
}
