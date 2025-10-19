import {
  NDKKind,
  useNDKCurrentUser,
  useNDKWallet,
  useSubscribe,
} from "@nostr-dev-kit/react";
// import { NDKCashuWallet } from "@nostr-dev-kit/wallet";
import { useEffect } from "react";
import { Button } from "./ui/button";
import { BitcoinFillIcon } from "./ui/icons/akar-icons-bitcoin-fill";

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
      const walletEvent = subscription.events[0];
      if (!walletEvent) {
        return;
      }
      // NDKCashuWallet.from(walletEvent).then((wallet) => {
      //   setActiveWallet(wallet);
      // });
    }
  }, [subscription?.events]);

  if (!currentUser) {
    return (
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground">Please log in to view wallet</p>
      </div>
    );
  }

  const handleClick = () => {
    console.log(activeWallet);
  };

  return (
    <Button onClick={handleClick}>
      <BitcoinFillIcon className="w-4 h-4 mr-2" />
      <p>{balance || "0"}</p>
    </Button>
  );
}
