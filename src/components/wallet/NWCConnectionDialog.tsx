import { useNDK } from "@nostr-dev-kit/react";
import { useState } from "react";
import { NDKNWCWallet } from "@nostr-dev-kit/wallet";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Link as LinkIcon, QrCode } from "lucide-react";
import { useWalletStore } from "../../stores/walletStore";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface NWCConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NWCConnectionDialog({
  open,
  onOpenChange,
}: NWCConnectionDialogProps) {
  const { ndk } = useNDK();
  const { setNWCWallet } = useWalletStore();
  const [connectionString, setConnectionString] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"input" | "scan">("input");

  const handleConnect = async () => {
    if (!connectionString.trim()) {
      setError("Please enter a connection string");
      return;
    }

    if (!ndk) {
      setError("NDK not initialized");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log("Attempting NWC connection with string:", connectionString);

      // NWC connection strings typically start with "nostr+walletconnect://"
      if (!connectionString.startsWith("nostr+walletconnect://")) {
        throw new Error(
          'Connection string must start with "nostr+walletconnect://"'
        );
      }

      // Parse the NWC connection string
      const url = new URL(connectionString);
      const pubkey = url.hostname || url.pathname.replace(/^\/\//, "");
      const relay = url.searchParams.get("relay");
      const secret = url.searchParams.get("secret");

      console.log("Parsed NWC params:", { pubkey, relay, secret: secret ? "***" : null });

      if (!pubkey || !relay || !secret) {
        throw new Error("Invalid NWC connection string format");
      }

      // Create NWC wallet instance
      console.log("Creating NDKNWCWallet instance...");
      const wallet = new NDKNWCWallet(ndk, {
        pubkey,
        relayUrls: [relay],
        secret,
        timeout: 5000, // 5 second timeout for wallet operations
      });

      console.log("NWC Wallet created successfully");

      // Store the wallet (connection will be tested when actually used)
      setNWCWallet(wallet, connectionString);

      // Close dialog and reset state
      setConnectionString("");
      setMode("input");
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to connect NWC wallet:", err);
      setError(
        err instanceof Error ? err.message : "Failed to connect to wallet"
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleScan = (result: string) => {
    setConnectionString(result);
    setMode("input");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect Nostr Wallet Connect (NWC)</DialogTitle>
          <DialogDescription>
            Connect your Lightning wallet using Nostr Wallet Connect for
            seamless zapping
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "input" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="nwc-string">Connection String</Label>
                <Input
                  id="nwc-string"
                  type="text"
                  placeholder="nostr+walletconnect://..."
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  disabled={isConnecting}
                />
                <p className="text-xs text-muted-foreground">
                  Get your NWC connection string from your wallet provider
                  (e.g., Alby, Mutiny, Coinos)
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setMode("scan")}
                  className="flex-1"
                  disabled={isConnecting}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Scan QR Code
                </Button>
              </div>

              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  {error}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="aspect-square w-full max-w-md mx-auto rounded-lg overflow-hidden bg-black">
                <Scanner
                  onScan={(result) => {
                    if (result && result.length > 0) {
                      handleScan(result[0].rawValue);
                    }
                  }}
                  onError={(error) => {
                    console.error("QR Scanner error:", error);
                    setError("Failed to access camera");
                  }}
                  constraints={{
                    facingMode: "environment",
                  }}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setMode("input")}
                className="w-full"
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                Enter Manually
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setConnectionString("");
              setError(null);
              setMode("input");
              onOpenChange(false);
            }}
            disabled={isConnecting}
          >
            Cancel
          </Button>
          <Button onClick={handleConnect} disabled={isConnecting || !connectionString}>
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
