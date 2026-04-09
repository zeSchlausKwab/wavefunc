import { useMemo, useState } from "react";
import { castUser } from "applesauce-common/casts";
import { useCurrentAccount } from "../../lib/nostr/auth";
import { useWavefuncNostr } from "../../lib/nostr/runtime";
import { useNWCConnectionStore } from "../../stores/nwcConnectionStore";
import { WalletView } from "../wallet/WalletManager";
import { NWCConnectionDialog } from "../wallet/NWCConnectionDialog";

export function WalletsSettings() {
  const currentUser = useCurrentAccount();
  const { eventStore } = useWavefuncNostr();
  const nwcConnection = useNWCConnectionStore((s) => s.connection);
  const disconnectNwc = useNWCConnectionStore((s) => s.disconnect);
  const [nwcDialogOpen, setNwcDialogOpen] = useState(false);

  // The NIP-60 wallet UI binds to the User cast, which exposes `wallet$`
  // (added by the side-effect import in lib/nostr/store.ts).
  const user = useMemo(
    () => (currentUser ? castUser(currentUser.pubkey, eventStore) : null),
    [currentUser?.pubkey, eventStore]
  );

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-2 pb-3 border-b-4 border-on-background">
        <span className="material-symbols-outlined text-[20px]">
          currency_bitcoin
        </span>
        <h3 className="text-base font-black uppercase tracking-tighter">
          Wallets
        </h3>
      </div>

      <p className="text-sm text-on-background/60">
        Manage your NIP-60 cashu wallet and optional Nostr Wallet Connect
        pairing for zapping stations and supporting creators.
      </p>

      {/* NIP-60 wallet (cashu) */}
      <div className="border-4 border-on-background p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">
            account_balance_wallet
          </span>
          <h4 className="text-[13px] font-black uppercase tracking-tighter">
            NIP-60 Cashu Wallet
          </h4>
        </div>
        {user ? (
          <WalletView user={user} />
        ) : (
          <p className="text-sm text-on-background/60">
            Log in to create or manage your NIP-60 wallet.
          </p>
        )}
      </div>

      {/* NWC pairing */}
      <div className="border-4 border-on-background p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">bolt</span>
          <h4 className="text-[13px] font-black uppercase tracking-tighter">
            Nostr Wallet Connect (optional)
          </h4>
        </div>
        <p className="text-sm text-on-background/60">
          Pair an external Lightning wallet (Alby, Mutiny, Coinos…) for zaps.
          Independent of the cashu wallet above.
        </p>

        {nwcConnection ? (
          <div className="space-y-3">
            <div className="border-2 border-on-background/30 bg-surface-container-low px-3 py-2">
              <p className="text-xs font-black uppercase tracking-wider">
                Connected
              </p>
              <p className="text-[11px] text-on-background/50 mt-0.5">
                Since {new Date(nwcConnection.connectedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setNwcDialogOpen(true)}
                className="flex-1 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                Reconnect
              </button>
              <button
                onClick={disconnectNwc}
                className="flex-1 border-4 border-red-700 shadow-[4px_4px_0px_0px_rgba(185,28,28,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-red-600 text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setNwcDialogOpen(true)}
            className="flex items-center gap-2 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            Configure NWC
          </button>
        )}
      </div>

      <NWCConnectionDialog
        open={nwcDialogOpen}
        onOpenChange={setNwcDialogOpen}
      />
    </div>
  );
}
