import { WalletButton } from "../WalletButton";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Wallet } from "lucide-react";

export function WalletsSettings() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Connected Wallets</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage your Nostr wallets and NWC connections for zapping stations and supporting creators.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border p-6 space-y-4">
          <Label>Current Wallet</Label>
          <div className="flex items-center gap-4">
            <WalletButton />
          </div>
        </div>

        <div className="rounded-lg border border-border p-6 space-y-4">
          <h4 className="font-semibold">Nostr Wallet Connect (NWC)</h4>
          <p className="text-sm text-muted-foreground">
            Connect your Lightning wallet using Nostr Wallet Connect to enable seamless zapping.
          </p>
          <Button variant="outline">Configure NWC</Button>
        </div>

        <div className="rounded-lg border border-border p-6 space-y-4">
          <h4 className="font-semibold">Transaction History</h4>
          <p className="text-sm text-muted-foreground">
            View your zap history and wallet transactions.
          </p>
          <Button variant="outline" disabled>
            View History (Coming Soon)
          </Button>
        </div>
      </div>
    </div>
  );
}
