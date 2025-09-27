import {
  NDKKind,
  useNDKCurrentUser,
  useNDKWallet,
  useSubscribe,
} from "@nostr-dev-kit/ndk-hooks";
import { useEffect } from "react";

export function WalletButton() {
  const { activeWallet, setActiveWallet, balance, setBalance } = useNDKWallet();
  const currentUser = useNDKCurrentUser();

  const subscriptionFilter = currentUser?.pubkey
    ? { kinds: [NDKKind.CashuWallet], authors: [currentUser.pubkey] }
    : null;

  const subscription = useSubscribe(
    subscriptionFilter ? [subscriptionFilter] : false
  );

  useEffect(() => {
    if (subscription?.events && subscription.events.length > 0) {
      const walletEvents = subscription.events;
      setActiveWallet(walletEvents[0]);
    }
  }, [subscription?.events]);

  useEffect(() => {
    console.log(activeWallet);
  }, [activeWallet]);

  if (!currentUser) {
    return (
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground">Please log in to view wallet</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <p>Balance: {balance || "0"}</p>
      {activeWallet && (
        <p className="text-sm text-muted-foreground">Wallet: Active</p>
      )}
    </div>
  );
}
