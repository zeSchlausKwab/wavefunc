import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { nostrService } from '@/lib/services/ndk'
import { auth } from '@/lib/store/auth'
import { NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import { useEffect, useState } from 'react'
import { BunkerConnect } from './BunkerConnect'
import { NOSTR_CONNECT_KEY, NOSTR_LOCAL_SIGNER_KEY, NostrConnectQR } from './NostrConnectQR'

export function NostrConnect() {
    const [showConnectBunkerScanner, setShowConnectBunkerScanner] = useState(false)
    const [showConnectQR, setShowConnectQR] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const authState = useStore(auth.store)

    useEffect(() => {
        const storedUrl = localStorage.getItem(NOSTR_CONNECT_KEY)
        const localSignerKey = localStorage.getItem(NOSTR_LOCAL_SIGNER_KEY)
        if (storedUrl && storedUrl.startsWith('bunker://') && localSignerKey) {
            const localSigner = new NDKPrivateKeySigner(localSignerKey)
            initializeStoredSigner(storedUrl, localSigner)
        }
    }, [])

    const initializeStoredSigner = async (url: string, localSigner: NDKPrivateKeySigner) => {
        try {
            const ndk = nostrService.getNDK()
            const nip46signer = new NDKNip46Signer(ndk, url, localSigner)
            await nip46signer.blockUntilReady()
            await auth.loginWithNostrConnect(nip46signer)
        } catch (error) {
            console.error('Failed to initialize stored signer:', error)
            localStorage.removeItem(NOSTR_CONNECT_KEY)
            localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
            setError('Failed to reconnect to signer. Please try connecting again.')
        }
    }

    const handleDisconnect = () => {
        auth.logout()
        localStorage.removeItem(NOSTR_CONNECT_KEY)
        localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
        setError(null)
    }

    const handleError = (error: string) => {
        setError(error)
        setShowConnectBunkerScanner(false)
        setShowConnectQR(false)
    }

    const isConnected = authState.status === 'authenticated'
    const isLoading = authState.status === 'loading'

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Connect Remote Signer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && <div className="text-sm text-red-500">{error}</div>}
                    <div className="flex gap-2">
                        {isConnected ? (
                            <Button variant="destructive" onClick={handleDisconnect} disabled={isLoading}>
                                {isLoading ? 'Disconnecting...' : 'Disconnect'}
                            </Button>
                        ) : (
                            <>
                                <Button onClick={() => setShowConnectBunkerScanner(true)} disabled={isLoading}>
                                    Scan Bunker QR
                                </Button>
                                <Button onClick={() => setShowConnectQR(true)} disabled={isLoading}>
                                    Show connection QR
                                </Button>
                            </>
                        )}
                    </div>
                    {isConnected && <div className="text-sm text-green-500">Successfully connected to bunker</div>}
                </CardContent>
            </Card>

            <Dialog open={showConnectBunkerScanner} onOpenChange={setShowConnectBunkerScanner}>
                <DialogContent>
                    <BunkerConnect onError={handleError} />
                </DialogContent>
            </Dialog>

            <Dialog open={showConnectQR} onOpenChange={setShowConnectQR}>
                <DialogContent>
                    <NostrConnectQR onError={handleError} />
                </DialogContent>
            </Dialog>
        </>
    )
}
