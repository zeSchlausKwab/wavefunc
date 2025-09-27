import {
  useNDKWallet
} from "@nostr-dev-kit/ndk-hooks";

export function WalletButton() {
const { activeWallet, setActiveWallet, balance, setBalance } = useNDKWallet()

  return (
    <div className="flex items-center gap-4">
      <p>Balance: {balance}</p>
    </div>
  );
}
