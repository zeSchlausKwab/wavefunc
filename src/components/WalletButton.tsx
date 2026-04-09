import { useMemo } from "react";
import { castUser } from "applesauce-common/casts";
import { use$ } from "applesauce-react/hooks";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { WalletView } from "./wallet/WalletManager";

/**
 * Header wallet pill. Shows the total NIP-60 cashu balance summed across
 * mints, or a "WALLET" prompt if no wallet exists yet. Reads the balance
 * straight from the User cast (`wallet$ → balance$`) so it stays reactive
 * to mint/redeem operations without going through any zustand store.
 *
 * Clicking the pill opens a popover that mounts the same `WalletView`
 * component used in the settings page, in `compact` mode (no Card wrapper,
 * tighter spacing).
 */
export function WalletButton() {
  const currentUser = useCurrentAccount();
  const { eventStore } = useWavefuncNostr();

  const user = useMemo(
    () => (currentUser ? castUser(currentUser.pubkey, eventStore) : null),
    [currentUser?.pubkey, eventStore]
  );

  const wallet = use$(user?.wallet$);
  const balance = use$(wallet?.balance$);

  if (!currentUser || !user) return null;

  const totalBalance = balance
    ? Object.values(balance).reduce((sum, amount) => sum + amount, 0)
    : 0;

  const trigger = wallet ? (
    <button
      className="h-full px-3 flex items-center gap-1.5 hover:bg-surface-container-high transition-colors border-r-4 border-on-background"
      title="Wallet"
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
  ) : (
    <button
      className="h-full px-3 flex items-center gap-1.5 border-r-4 border-on-background hover:bg-surface-container-high transition-colors"
      title="Open wallet"
    >
      <span className="material-symbols-outlined text-[16px]">
        currency_bitcoin
      </span>
      <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">
        WALLET
      </span>
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[360px] sm:w-[400px] p-0">
        <WalletView user={user} compact />
      </PopoverContent>
    </Popover>
  );
}
