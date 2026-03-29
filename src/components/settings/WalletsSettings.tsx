import { useState } from "react";
import { WalletButton } from "../WalletButton";
import { NWCConnectionDialog } from "../wallet/NWCConnectionDialog";
import { CashuWalletSetup } from "../wallet/CashuWalletSetup";
import { useWalletStore } from "../../stores/walletStore";

export function WalletsSettings() {
  const [nwcDialogOpen, setNwcDialogOpen] = useState(false);
  const {
    nwcConnection,
    cashuConnection,
    activeWalletType,
    setActiveWalletType,
    disconnectNWC,
  } = useWalletStore();

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-2 pb-3 border-b-4 border-on-background">
        <span className="material-symbols-outlined text-[20px]">currency_bitcoin</span>
        <h3 className="text-base font-black uppercase tracking-tighter">Wallets</h3>
      </div>

      <p className="text-sm text-on-background/60">
        Manage your Nostr wallets and NWC connections for zapping stations and
        supporting creators.
      </p>

      {/* Current balance */}
      {(nwcConnection || cashuConnection) && (
        <div className="border-4 border-on-background p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">monitoring</span>
            <span className="text-[11px] font-black uppercase tracking-widest">Current Balance</span>
          </div>
          <WalletButton />

          {nwcConnection && cashuConnection && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-on-background/60">
                Active Wallet
              </label>
              <div className="border-2 border-on-background">
                <select
                  value={activeWalletType || ""}
                  onChange={(e) => setActiveWalletType(e.target.value as "nwc" | "cashu")}
                  className="w-full bg-surface text-on-background text-sm px-3 py-2 appearance-none cursor-pointer focus:outline-none"
                >
                  <option value="nwc">Nostr Wallet Connect (NWC)</option>
                  <option value="cashu">Cashu Wallet</option>
                </select>
              </div>
              <p className="text-[10px] text-on-background/40">
                Choose which wallet to use for zaps and payments
              </p>
            </div>
          )}
        </div>
      )}

      {/* NWC Section */}
      <div className="border-4 border-on-background p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">bolt</span>
          <h4 className="text-[13px] font-black uppercase tracking-tighter">
            Nostr Wallet Connect (NWC)
          </h4>
        </div>
        <p className="text-sm text-on-background/60">
          Connect your Lightning wallet using Nostr Wallet Connect to enable
          seamless zapping.
        </p>

        {nwcConnection ? (
          <div className="space-y-3">
            <div className="border-2 border-on-background/30 bg-surface-container-low px-3 py-2">
              <p className="text-xs font-black uppercase tracking-wider">Connected</p>
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
                onClick={disconnectNWC}
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

      {/* Cashu Wallet Section */}
      <div className="border-4 border-on-background p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">savings</span>
          <h4 className="text-[13px] font-black uppercase tracking-tighter">
            Cashu Wallet (NIP-60)
          </h4>
        </div>
        <p className="text-sm text-on-background/60">
          Create or manage your Cashu eCash wallet. This wallet is completely
          independent of NWC.
        </p>
        <CashuWalletSetup />
      </div>

      <NWCConnectionDialog
        open={nwcDialogOpen}
        onOpenChange={setNwcDialogOpen}
      />
    </div>
  );
}
