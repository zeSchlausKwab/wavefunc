import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import NDK, { NDKEvent, NDKKind, NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2 } from "lucide-react";

interface Nip46LoginDialogProps {
  trigger: React.ReactNode;
  onLogin: (signer: NDKNip46Signer) => Promise<void>;
}

type TabType = "scan" | "paste";

export function Nip46LoginDialog({ trigger, onLogin }: Nip46LoginDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("scan");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSigner, setLocalSigner] = useState<NDKPrivateKeySigner | null>(null);
  const [localPubkey, setLocalPubkey] = useState<string | null>(null);
  const [connectionUri, setConnectionUri] = useState<string>("");
  const [generatingConnectionUrl, setGeneratingConnectionUrl] = useState(false);
  const [listening, setListening] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const tempSecretRef = useRef<string>(Math.random().toString(36).substring(2, 15));
  const isLoggingInRef = useRef(false);
  const activeSubscriptionRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const hasTriggeredSuccessRef = useRef(false);
  const nip46NdkRef = useRef<NDK | null>(null);

  const cleanup = useCallback(() => {
    if (!isMountedRef.current) return;

    isLoggingInRef.current = false;

    if (activeSubscriptionRef.current) {
      try {
        activeSubscriptionRef.current.stop();
      } catch (e) {
        console.error('Error stopping subscription:', e);
      }
      activeSubscriptionRef.current = null;
    }

    if (nip46NdkRef.current) {
      try {
        nip46NdkRef.current = null;
      } catch (e) {
        console.error('Error cleaning up NIP-46 NDK:', e);
      }
    }

    setListening(false);
  }, []);

  const constructBunkerUrl = useCallback(
    (event: NDKEvent) => {
      const baseUrl = `bunker://${event.pubkey}?`;
      const relay = 'wss://relay.nsec.app';

      const params = new URLSearchParams();
      params.set('relay', relay);
      params.set('secret', tempSecretRef.current);

      return baseUrl + params.toString();
    },
    [],
  );

  const triggerSuccess = useCallback(() => {
    if (hasTriggeredSuccessRef.current) {
      return;
    }

    hasTriggeredSuccessRef.current = true;
    cleanup();

    isMountedRef.current = false;
  }, [cleanup]);

  const handleLoginWithNip46Signer = useCallback(
    async (event: NDKEvent) => {
      if (isLoggingInRef.current || !isMountedRef.current || hasTriggeredSuccessRef.current) {
        return;
      }

      try {
        isLoggingInRef.current = true;
        cleanup();

        const bunkerUrl = constructBunkerUrl(event);
        if (!localSigner) {
          throw new Error('No local signer available');
        }

        setConnectionStatus('connected');

        // Create NIP-46 signer from bunker URL
        const ndk = new NDK({
          explicitRelayUrls: ['wss://relay.nsec.app'],
        });
        await ndk.connect();

        const nip46Signer = NDKNip46Signer.bunker(ndk, bunkerUrl, localSigner);
        await nip46Signer.blockUntilReady();

        await onLogin(nip46Signer);

        triggerSuccess();
        setOpen(false);
      } catch (err) {
        console.error('NIP-46 login error:', err);

        if (isMountedRef.current) {
          setConnectionStatus('error');
          setError(err instanceof Error ? err.message : 'Connection error');
        }

        isLoggingInRef.current = false;
      }
    },
    [localSigner, constructBunkerUrl, cleanup, triggerSuccess, onLogin],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (activeSubscriptionRef.current) {
        try {
          activeSubscriptionRef.current.stop();
        } catch (e) {
          console.error('Error stopping subscription:', e);
        }
        activeSubscriptionRef.current = null;
      }
    };
  }, []);

  // Initialize the local signer and generate connection URI when dialog opens
  useEffect(() => {
    if (!open) return;
    if (connectionUri) return;

    setGeneratingConnectionUrl(true);
    const signer = NDKPrivateKeySigner.generate();
    setLocalSigner(signer);

    signer
      .user()
      .then((user) => {
        if (!isMountedRef.current) return;
        setLocalPubkey(user.pubkey);

        const relay = 'wss://relay.nsec.app';
        const params = new URLSearchParams();
        params.set('relay', relay);
        params.set('metadata', JSON.stringify({
          name: 'WaveFunc Radio',
          description: 'Connect with WaveFunc Radio',
          url: window.location.origin,
          icons: [],
        }));
        params.set('token', tempSecretRef.current);

        const uri = `nostrconnect://${user.pubkey}?${params.toString()}`;
        setConnectionUri(uri);
        setGeneratingConnectionUrl(false);
      })
      .catch((err) => {
        console.error('Failed to get user pubkey:', err);
        if (!isMountedRef.current) return;
        setConnectionStatus('error');
        setError('Failed to initialize connection');
      });
  }, [open, connectionUri]);

  // Set up NIP-46 subscription to listen for connection requests
  useEffect(() => {
    if (
      !localPubkey ||
      !localSigner ||
      !connectionUri ||
      isLoggingInRef.current ||
      hasTriggeredSuccessRef.current ||
      !isMountedRef.current ||
      !open
    ) {
      return;
    }

    const initNip46Connection = async () => {
      setListening(true);
      setConnectionStatus('connecting');

      const ndk = new NDK({
        explicitRelayUrls: ['wss://relay.nsec.app'],
      });

      nip46NdkRef.current = ndk;

      try {
        await ndk.connect();
      } catch (error) {
        console.error('Failed to connect to NIP-46 relay:', error);
        setConnectionStatus('error');
        setError('Failed to connect to NIP-46 relay');
        return;
      }

      const processedRequestIds = new Set<string>();
      const processedAckIds = new Set<string>();

      const sub = ndk.subscribe(
        {
          kinds: [NDKKind.NostrConnect],
          '#p': [localPubkey],
        },
        { closeOnEose: false },
      );

      activeSubscriptionRef.current = sub;

      sub.on('event', async (event: NDKEvent) => {
        if (isLoggingInRef.current || !isMountedRef.current || hasTriggeredSuccessRef.current) {
          return;
        }

        try {
          await event.decrypt(undefined, localSigner);
          const request = JSON.parse(event.content);

          if (request.method === 'connect') {
            if (request.id && processedRequestIds.has(request.id)) {
              return;
            }

            if (request.id) {
              processedRequestIds.add(request.id);
            }

            if (request.params && request.params.token === tempSecretRef.current) {
              const response = {
                id: request.id,
                result: tempSecretRef.current,
              };

              const responseEvent = new NDKEvent(ndk);
              responseEvent.kind = NDKKind.NostrConnect;
              responseEvent.tags = [['p', event.pubkey]];
              responseEvent.content = JSON.stringify(response);

              try {
                await responseEvent.sign(localSigner);
                // @ts-ignore - NDK type mismatch between versions
                await responseEvent.encrypt(undefined, localSigner, event.pubkey);
                await responseEvent.publish();
              } catch (err) {
                console.error('Error sending NIP-46 approval:', err);
                if (isMountedRef.current && !hasTriggeredSuccessRef.current) {
                  setConnectionStatus('error');
                  setError(err instanceof Error ? err.message : 'Error sending approval');
                }
              }
            }
          } else if (request.result === 'ack') {
            if (processedAckIds.has(event.id)) {
              return;
            }

            processedAckIds.add(event.id);
            await handleLoginWithNip46Signer(event);
          }
        } catch (error) {
          console.error('Failed to process NIP-46 event:', error);
          if (isMountedRef.current && !hasTriggeredSuccessRef.current) {
            setConnectionStatus('error');
            setError(error instanceof Error ? error.message : 'Failed to process event');
          }
        }
      });

      const timeout = setTimeout(() => {
        if (isMountedRef.current && !hasTriggeredSuccessRef.current && connectionStatus !== 'connected' && !isLoggingInRef.current) {
          cleanup();
          setConnectionStatus('error');
          setError('Connection timed out. Please try again.');
        }
      }, 300000); // 5 minutes

      return () => {
        clearTimeout(timeout);
        cleanup();
      };
    };

    initNip46Connection();
  }, [connectionUri, localPubkey, localSigner, open, handleLoginWithNip46Signer, cleanup, connectionStatus]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Reset state when dialog closes
      cleanup();
      setLocalSigner(null);
      setLocalPubkey(null);
      setConnectionUri("");
      setBunkerUrl("");
      setError(null);
      setLoading(false);
      setGeneratingConnectionUrl(false);
      setConnectionStatus('idle');
      hasTriggeredSuccessRef.current = false;
      isLoggingInRef.current = false;
    }
  };

  const handlePasteLogin = async () => {
    if (!bunkerUrl.trim()) {
      setError("Please enter a bunker URL");
      return;
    }

    if (!localSigner) {
      setError("Local signer not initialized");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create NDK instance and signer from bunker URL
      const ndk = new NDK({
        explicitRelayUrls: ['wss://relay.nsec.app'],
      });
      await ndk.connect();

      const signer = NDKNip46Signer.bunker(ndk, bunkerUrl, localSigner);
      await signer.blockUntilReady();

      await onLogin(signer);
      setOpen(false);
    } catch (err: any) {
      console.error("NIP-46 login failed:", err);
      setError(err.message || "Failed to connect with bunker URL");
    } finally {
      setLoading(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with Remote Signer</DialogTitle>
          <DialogDescription>
            Use a remote signer app like Amber or nsecBunker
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tab Buttons */}
          <div className="flex gap-2 border-b border-brutal">
            <button
              onClick={() => setActiveTab("scan")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "scan"
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              Scan QR Code
            </button>
            <button
              onClick={() => setActiveTab("paste")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "paste"
                  ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              Paste Bunker URL
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "scan" ? (
            <div className="space-y-4">
              {connectionStatus === 'connected' ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <div className="text-green-500 mb-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <p className="text-sm text-green-500 font-medium">Connected successfully!</p>
                  <p className="text-sm text-muted-foreground">Logging you in...</p>
                </div>
              ) : generatingConnectionUrl ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm text-muted-foreground">Generating connection...</p>
                </div>
              ) : connectionUri ? (
                <>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Scan this QR code with your remote signer app (e.g., Amber)
                  </div>

                  <a
                    href={connectionUri}
                    className="block hover:opacity-90 transition-opacity bg-white p-4 rounded-lg"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <QRCodeSVG
                      value={connectionUri}
                      size={250}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="L"
                    />
                  </a>

                  {listening && (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Waiting for approval...</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Input
                      value={connectionUri}
                      readOnly
                      onClick={(e) => e.currentTarget.select()}
                      className="font-mono text-xs"
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm text-muted-foreground">Initializing connection...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bunker-url">Bunker URL</Label>
                <Input
                  id="bunker-url"
                  type="text"
                  placeholder="bunker://..."
                  value={bunkerUrl}
                  onChange={(e) => setBunkerUrl(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Enter the bunker URL from your remote signer
                </p>
              </div>

              <Button
                onClick={handlePasteLogin}
                disabled={loading || !bunkerUrl.trim()}
                className="w-full"
              >
                {loading ? "Connecting..." : "Connect"}
              </Button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
