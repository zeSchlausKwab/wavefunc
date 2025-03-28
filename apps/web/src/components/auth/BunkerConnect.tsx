import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import { NDKNip46Signer } from '@nostr-dev-kit/ndk'
import { Loader2 } from 'lucide-react'
import { ndkActions } from '@/lib/store/ndk'
import { authActions } from '@/lib/store/auth'

interface BunkerConnectProps {
    onError?: (error: string) => void
}

export function BunkerConnect({ onError }: BunkerConnectProps) {
    const [bunkerUrl, setBunkerUrl] = useState('')
    const [loading, setLoading] = useState(false)

    const handleConnect = async (url: string) => {
        setLoading(true)

        try {
            const ndk = ndkActions.getNDK()

            if (!ndk) {
                throw new Error('NDK not initialized')
            }
            const nip46signer = new NDKNip46Signer(ndk, url)
            await nip46signer.blockUntilReady()
            // TODO: implement bunker
            // await authActions.loginWithNip46('', nip46signer)
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
