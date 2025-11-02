import { useState } from "react";
import { WalletButton } from "../WalletButton";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Wallet, Zap, Coins, Activity } from "lucide-react";
import { NWCConnectionDialog } from "../wallet/NWCConnectionDialog";
import { CashuWalletSetup } from "../wallet/CashuWalletSetup";
import { useWalletStore } from "../../stores/walletStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

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
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Connected Wallets</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your Nostr wallets and NWC connections for zapping stations and
          supporting creators.
        </p>
      </div>

      <div className="space-y-4">
        {/* Current Balance Display */}
        {(nwcConnection || cashuConnection) && (
          <div className="rounded-lg border border-border bg-muted/50 p-2 md:p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              <Label className="text-base font-semibold">Current Balance</Label>
            </div>
            <div className="flex items-center gap-4">
              <WalletButton />
            </div>
            {nwcConnection && cashuConnection && (
              <div className="space-y-2">
                <Label className="text-sm">Active Wallet</Label>
                <Select
                  value={activeWalletType || ""}
                  onValueChange={(value) =>
                    setActiveWalletType(value as "nwc" | "cashu")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select active wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nwc">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        <span>Nostr Wallet Connect</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="cashu">
                      <div className="flex items-center gap-2">
                        <Coins className="w-4 h-4" />
                        <span>Cashu Wallet</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose which wallet to use for zaps and payments
                </p>
              </div>
            )}
          </div>
        )}

        {/* NWC Section */}
        <div className="rounded-lg border border-border p-2 md:p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            <h4 className="font-semibold">Nostr Wallet Connect (NWC)</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect your Lightning wallet using Nostr Wallet Connect to enable
            seamless zapping.
          </p>

          {nwcConnection ? (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Connected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connected on{" "}
                  {new Date(nwcConnection.connectedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setNwcDialogOpen(true)}
                  className="flex-1"
                >
                  Reconnect
                </Button>
                <Button
                  variant="destructive"
                  onClick={disconnectNWC}
                  className="flex-1"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setNwcDialogOpen(true)}>
              <Zap className="w-4 h-4 mr-2" />
              Configure NWC
            </Button>
          )}
        </div>

        {/* Cashu Wallet Section */}
        <div className="rounded-lg border border-border p-2 md:p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5" />
            <h4 className="font-semibold">Cashu Wallet (NIP-60)</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Create or manage your Cashu eCash wallet. This wallet is completely
            independent of NWC.
          </p>
          <CashuWalletSetup />
        </div>
      </div>

      {/* NWC Connection Dialog */}
      <NWCConnectionDialog
        open={nwcDialogOpen}
        onOpenChange={setNwcDialogOpen}
      />
    </div>
  );
}
