import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { authActions, ndkActions, uiActions, NOSTR_AUTO_LOGIN } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Scanner } from '@yudiel/react-qr-scanner'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

interface BunkerConnectProps {
    onError?: (error: string) => void
    autoLogin?: boolean
}

export function BunkerConnect({ onError, autoLogin = true }: BunkerConnectProps) {
    const [bunkerUrl, setBunkerUrl] = useState('')
    const [loading, setLoading] = useState(false)

    const handleConnect = async (url: string) => {
        setLoading(true)

        try {
            const ndk = ndkActions.getNDK()

            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            // Generate a local signer for NIP-46
            const localSigner = NDKPrivateKeySigner.generate()
            await localSigner.blockUntilReady()

            // Set auto-login preference
            if (autoLogin) {
                localStorage.setItem(NOSTR_AUTO_LOGIN, 'true')
            } else {
                localStorage.removeItem(NOSTR_AUTO_LOGIN)
            }

            // Use the loginWithNip46 method from authActions
            await authActions.loginWithNip46(url, localSigner)

            // Close the dialog on success
            uiActions.closeAuthDialog()
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to connect'
            onError?.(errorMessage)
            console.error('Connection error:', err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 py-4">
            <div className="relative aspect-square w-full max-w-[300px] mx-auto overflow-hidden rounded-lg">
                <Scanner
                    onScan={(results) => results?.[0]?.rawValue && handleConnect(results[0].rawValue)}
                    onError={(error) => {
                        console.error('Scanner error:', error)
                        onError?.('Failed to access camera')
                    }}
                />
            </div>
            <p className="text-sm text-muted-foreground text-center">Or enter a bunker:// URL manually</p>
            <div className="flex gap-2">
                <Input
                    value={bunkerUrl}
                    onChange={(e) => setBunkerUrl(e.target.value)}
                    placeholder="Enter bunker:// URL"
                    disabled={loading}
                />
                <Button onClick={() => handleConnect(bunkerUrl)} disabled={loading || !bunkerUrl}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                </Button>
            </div>
        </div>
    )
}
