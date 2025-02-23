"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAtom, useSetAtom } from "jotai";
import {
  loginDialogAtom,
  loginWithPrivateKey,
  loginWithExtension,
  loginWithNip46,
} from "../atoms/auth";
import { useState } from "react";
import { NostrConnect } from "./NostrConnect";
import { NostrConnectQR } from "./NostrConnectQR";
import { BunkerConnectDialog } from "./BunkerConnectDialog";
import { NDKNip46Signer } from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";

export function LoginDialog() {
  const [isOpen, setIsOpen] = useAtom(loginDialogAtom);
  const loginWithKey = useSetAtom(loginWithPrivateKey);
  const loginWithExt = useSetAtom(loginWithExtension);
  const loginWithNip46Signer = useSetAtom(loginWithNip46);
  const [privateKey, setPrivateKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showBunkerDialog, setShowBunkerDialog] = useState(false);

  const handlePrivateKeyLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await loginWithKey(privateKey);
    } catch (error) {
      setError("Login failed. Please check your private key.");
    } finally {
      setLoading(false);
    }
  };

  const handleExtensionLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await loginWithExt();
    } catch (error) {
      setError("Extension login failed. Is your extension installed?");
    } finally {
      setLoading(false);
    }
  };

  const handleNostrConnectSuccess = async (signer: NDKNip46Signer) => {
    try {
      setLoading(true);
      setError(null);
      await loginWithNip46Signer(signer);
    } catch (error) {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Login to WaveFunc</DialogTitle>
          <DialogDescription>
            Choose your preferred login method below.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="private-key" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="private-key">Private Key</TabsTrigger>
            <TabsTrigger value="connect">Nostr Connect</TabsTrigger>
            <TabsTrigger value="extension">Extension</TabsTrigger>
          </TabsList>
          <TabsContent value="private-key">
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="private-key">Private Key (nsec)</Label>
                <Input
                  id="private-key"
                  type="password"
                  placeholder="nsec1..."
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
              </div>
              <Button
                onClick={handlePrivateKeyLogin}
                disabled={loading || !privateKey}
                className="w-full"
              >
                {loading ? "Logging in..." : "Login"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="connect">
            <Tabs defaultValue="qr" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="qr">QR Code</TabsTrigger>
                <TabsTrigger value="bunker">Bunker</TabsTrigger>
              </TabsList>

              <TabsContent value="qr">
                <NostrConnectQR onError={setError} />
              </TabsContent>

              <TabsContent value="bunker">
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Scan a Bunker QR code to connect.
                  </p>
                  <Button
                    onClick={() => setShowBunkerDialog(true)}
                    className="w-full"
                  >
                    Scan Bunker QR
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="extension">
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Login using your Nostr browser extension (e.g., Alby, nos2x).
              </p>
              <Button
                onClick={handleExtensionLogin}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Connecting..." : "Connect to Extension"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        {error && (
          <div className="text-sm text-red-500 mt-2 text-center">{error}</div>
        )}
      </DialogContent>

      <BunkerConnectDialog
        open={showBunkerDialog}
        onOpenChange={setShowBunkerDialog}
        onConnect={handleNostrConnectSuccess}
      />
    </Dialog>
  );
}
