'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { nostrService } from '@/services/ndk'
import { NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { useEffect, useState } from 'react'
import { BunkerConnectDialog } from './BunkerConnectDialog'
import { NostrConnectQRDialog } from './NostrConnectQRDialog'

export const NOSTR_CONNECT_KEY = 'nostr_connect_url'
export const NOSTR_LOCAL_SIGNER_KEY = 'local_signer'
export function NostrConnect() {
  const [showConnectBunkerScanner, setShowConnectBunkerScanner] = useState(false)
  const [showConnectQR, setShowConnectQR] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const storedUrl = localStorage.getItem(NOSTR_CONNECT_KEY)
    const localSignerKey = localStorage.getItem('local_signer')
    if (storedUrl && storedUrl.startsWith('bunker://')) {
      console.log('storedUrl', storedUrl)
      const localSigner = new NDKPrivateKeySigner(localSignerKey ?? '')
      const url = new URL(storedUrl)

      console.log('url', url)

      initializeStoredSigner(url.toString(), localSigner)
    }
  }, [])

  const initializeStoredSigner = async (url: string, localSigner: NDKPrivateKeySigner) => {
    try {
      const ndk = nostrService.getNDK()
      const nip46signer = new NDKNip46Signer(ndk, url, localSigner)
      console.log('nip46signer', nip46signer)
      await nip46signer.blockUntilReady()
      console.log('nip46signer ready')
      ndk.signer = nip46signer
      setConnected(true)
    } catch (error) {
      console.error('Failed to initialize stored signer:', error)
      localStorage.removeItem(NOSTR_CONNECT_KEY)
      localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
      setError('Failed to reconnect to signer. Please try connecting again.')
    }
  }

  const handleConnectBunkerScanner = async (signer: NDKNip46Signer) => {
    const ndk = nostrService.getNDK()
    ndk.signer = signer

    const user = await ndk.signer.user()
    const profile = await user.fetchProfile()

    setConnected(true)
  }

  const handleConnectQR = async (signer: NDKNip46Signer) => {
    const ndk = nostrService.getNDK()
    ndk.signer = signer

    const user = await ndk.signer.user()
    const profile = await user.fetchProfile()
    console.log(profile)

    // The NostrConnectQRDialog handles storing the bunker URL
    setConnected(true)
  }

  const handleConnectExtension = async () => {
    try {
      if (typeof window === 'undefined' || !window.nostr) {
        setError('No Nostr extension found. Please install one (like Alby or nos2x).')
        return
      }

      const ndk = nostrService.getNDK()
      const extensionSigner = new NDKNip07Signer()
      await extensionSigner.blockUntilReady()
      ndk.signer = extensionSigner

      const user = await ndk.signer.user()
      const profile = await user.fetchProfile()
      console.log('Connected with extension:', profile)

      setConnected(true)
      setError(null)
    } catch (err) {
      console.error('Failed to connect to extension:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect to extension')
    }
  }

  const handleDisconnect = () => {
    const ndk = nostrService.getNDK()
    ndk.signer = NDKPrivateKeySigner.generate()
    localStorage.removeItem(NOSTR_CONNECT_KEY)
    localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
    setConnected(false)
    setError(null)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Connect Remote Signer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="flex gap-2">
            {connected ? (
              <Button variant="destructive" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : (
              <>
                <Button onClick={() => setShowConnectBunkerScanner(true)}>Scan Bunker QR</Button>
                <Button onClick={() => setShowConnectQR(true)}>Show connection QR</Button>
                <Button onClick={handleConnectExtension}>Connect Extension</Button>
              </>
            )}
          </div>
          {connected && <div className="text-sm text-green-500">Successfully connected to bunker</div>}
        </CardContent>
      </Card>

      <BunkerConnectDialog
        open={showConnectBunkerScanner}
        onOpenChange={setShowConnectBunkerScanner}
        onConnect={handleConnectBunkerScanner}
      />
      <NostrConnectQRDialog open={showConnectQR} onOpenChange={setShowConnectQR} onDone={handleConnectQR} />
    </>
  )
}
