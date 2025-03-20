import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nostrService } from '@/lib/services/ndk'
import { NDKEvent, NDKKind, NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { CopyIcon, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useState } from 'react'
import { auth } from '@/lib/store/auth'

interface NostrConnectQRProps {
    onError?: (error: string) => void
}

export const NOSTR_CONNECT_KEY = 'nostr_connect_url'
export const NOSTR_LOCAL_SIGNER_KEY = 'nostr_local_signer'

export function NostrConnectQR({ onError }: NostrConnectQRProps) {
    const [localSigner, setLocalSigner] = useState<NDKPrivateKeySigner | null>(null)
    const [localPubkey, setLocalPubkey] = useState<string | null>(null)
    const [tempSecret, setTempSecret] = useState<string | null>(null)
    const [listening, setListening] = useState(false)
    const [generatingConnectionUrl, setGeneratingConnectionUrl] = useState(false)

    useEffect(() => {
        setGeneratingConnectionUrl(true)
        const signer = NDKPrivateKeySigner.generate()
        setLocalSigner(signer)
        signer.user().then((user) => {
            setLocalPubkey(user.pubkey)
            setGeneratingConnectionUrl(false)
        })

        return () => {
            setLocalSigner(null)
            setLocalPubkey(null)
        }
    }, [])

    const connectionUrl = useMemo(() => {
        if (!localPubkey) return null
        const localMachineIp = import.meta.env.VITE_PUBLIC_HOST
        const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
        const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
        const PORT_OR_DEFAULT = import.meta.env.DEV ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`
        const host = location.protocol + '//' + localMachineIp
        const secret = Math.random().toString(6).substring(2, 15)

        setTempSecret(secret)

        const params = new URLSearchParams()
        params.set('relay', relay)
        params.set('name', 'WaveFunc')
        params.set('url', host)
        params.set('secret', secret)

        return `nostrconnect://${localPubkey}?` + params.toString()
    }, [localPubkey])

    const constructBunkerUrl = (event: NDKEvent) => {
        const pTag = event.tags.find((tag) => tag[0] === 'p')
        if (!pTag?.[1]) throw new Error('No pubkey in p tag')

        const baseUrl = `bunker://${event.pubkey}?`
        const localMachineIp = import.meta.env.VITE_PUBLIC_HOST
        const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
        const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
        const PORT_OR_DEFAULT = import.meta.env.DEV ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

        const params = new URLSearchParams()
        params.set('relay', relay)
        params.set('secret', tempSecret ?? '')

        return baseUrl + params.toString()
    }

    useEffect(() => {
        if (!localPubkey || !localSigner) return

        setListening(true)
        const ndk = nostrService.getNDK()
        const ackSub = ndk.subscribe({
            kinds: [NDKKind.NostrConnect],
            '#p': [localPubkey],
            since: Math.floor(Date.now() / 1000) - 10,
            limit: 1,
        })

        ackSub.on('event', async (event) => {
            console.log('Received event:', event)
            try {
                await event.decrypt(undefined, localSigner)
                const response = JSON.parse(event.content)

                if (response.result && response.result === tempSecret) {
                    const bunkerUrl = constructBunkerUrl(event)
                    const nip46Signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)
                    await nip46Signer.blockUntilReady()
                    setListening(false)

                    localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey ?? '')
                    localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

                    await auth.loginWithNostrConnect(nip46Signer)
                }
            } catch (error) {
                console.error('Failed to process event:', error)
                onError?.(error instanceof Error ? error.message : 'Failed to connect')
            }
        })

        return () => {
            ackSub.stop()
            setListening(false)
        }
    }, [connectionUrl, localPubkey, localSigner, onError, tempSecret])

    // nostrconnect://951f4fd275611ee88d466fe17219e47c90dd40383b6d94949016802461e64436?relay=ws%3A%2F%2F192.168.0.16%3A3002&name=WaveFunc&url=http%3A%2F%2F192.168.0.16&secret=0304312453245

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).catch((err) => {
            console.warn('Failed to copy:', err)
        })
    }

    return (
        <div className="flex flex-col items-center gap-4 py-4">
            {generatingConnectionUrl ? (
                <div className="flex flex-col items-center gap-2 py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm text-muted-foreground">Generating connection...</p>
                </div>
            ) : connectionUrl ? (
                <>
                    <a
                        href={connectionUrl}
                        className="block hover:opacity-90 transition-opacity"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <QRCodeSVG value={connectionUrl} size={300} />
                    </a>
                    <div className="flex items-center gap-2 w-full">
                        <Input value={connectionUrl} readOnly onClick={(e) => e.currentTarget.select()} />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(connectionUrl)}>
                            <CopyIcon className="h-4 w-4" />
                        </Button>
                        {listening && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm text-muted-foreground">Waiting for connection...</p>
                </div>
            )}
        </div>
    )
}
