import { NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Label } from "./ui/label";
import { Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { nip19 } from "nostr-tools";

interface SignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (signer: any) => Promise<void>;
}

export function SignupDialog({ open, onOpenChange, onConfirm }: SignupDialogProps) {
  const [signer] = useState(() => NDKPrivateKeySigner.generate());
  const [nsecCopied, setNsecCopied] = useState(false);
  const [npubCopied, setNpubCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nsec, setNsec] = useState("");
  const [npub, setNpub] = useState("");

  // Generate nsec and npub when dialog opens
  useEffect(() => {
    if (open && signer) {
      // Get the hex private key
      const privateKeyHex = signer.privateKey;
      if (privateKeyHex) {
        // Convert hex to Uint8Array for encoding
        const privateKeyBytes = new Uint8Array(
          privateKeyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
        );
        setNsec(nip19.nsecEncode(privateKeyBytes));
      }

      // Get public key
      signer.user().then((user) => {
        if (user.pubkey) {
          setNpub(nip19.npubEncode(user.pubkey));
        }
      });
    }
  }, [open, signer]);

  const handleCopyNsec = async () => {
    await navigator.clipboard.writeText(nsec);
    setNsecCopied(true);
    setTimeout(() => setNsecCopied(false), 2000);
  };

  const handleCopyNpub = async () => {
    await navigator.clipboard.writeText(npub);
    setNpubCopied(true);
    setTimeout(() => setNpubCopied(false), 2000);
  };

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm(signer);
      onOpenChange(false);
    } catch (error) {
      console.error("Signup failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Your Nostr Account</DialogTitle>
          <DialogDescription>
            Your account has been generated. Please save your private key (nsec) securely.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning Alert */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important: Save Your Private Key</AlertTitle>
            <AlertDescription>
              Your private key (nsec) is the only way to access your account. If you lose it,
              you will lose access to your account forever. There is no way to recover it.
              Store it somewhere safe, like a password manager.
            </AlertDescription>
          </Alert>

          {/* Private Key (nsec) */}
          <div className="space-y-2">
            <Label htmlFor="nsec">Private Key (nsec)</Label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-destructive/10 border border-destructive/30 rounded-md font-mono text-sm break-all">
                {nsec}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyNsec}
                className="flex-shrink-0"
              >
                {nsecCopied ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Keep this private! Never share your nsec with anyone.
            </p>
          </div>

          {/* Public Key (npub) */}
          <div className="space-y-2">
            <Label htmlFor="npub">Public Key (npub)</Label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-muted rounded-md font-mono text-sm break-all">
                {npub}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyNpub}
                className="flex-shrink-0"
              >
                {npubCopied ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This is your public identifier. You can share this with others.
            </p>
          </div>

          {/* Additional Info */}
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-semibold text-sm">What's next?</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Copy and save your private key (nsec) in a safe place</li>
              <li>You can import this key into other Nostr clients</li>
              <li>Use your public key (npub) to let others find you</li>
              <li>Set up your profile in the settings after logging in</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Creating Account..." : "I've Saved My Key, Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
