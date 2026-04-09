import { useState } from "react";
import { Link as LinkIcon, QrCode } from "lucide-react";
import { useNWCConnectionStore } from "../../stores/nwcConnectionStore";
import { parseNWCConnectionString } from "../../lib/nostr/nwc";
import { QRScanner } from "../QRScanner";
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

/**
 * NWC pairing dialog. Validates the connection string by parsing it (no
 * network round-trip) and persists it via `useNWCConnectionStore`. The
 * actual `pay_invoice` flow lives in `src/lib/nostr/nwc.ts` and is invoked
 * from `ZapDialog` when the user picks the NWC zap path.
 */
export function NWCConnectionDialog({
  open,
  onOpenChange,
}: NWCConnectionDialogProps) {
  const setConnection = useNWCConnectionStore((s) => s.setConnection);
  const [connectionString, setConnectionString] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"input" | "scan">("input");

  const handleConnect = () => {
    if (!connectionString.trim()) {
      setError("Please enter a connection string");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Validate by parsing — throws on bad scheme / missing relay / missing secret.
      parseNWCConnectionString(connectionString);
      setConnection(connectionString);
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
              <QRScanner
                onScan={(data) => handleScan(data)}
                onClose={() => setMode("input")}
              />
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
          <Button
            onClick={handleConnect}
            disabled={isConnecting || !connectionString}
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
