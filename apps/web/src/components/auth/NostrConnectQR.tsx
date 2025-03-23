import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nostrService } from '@/lib/services/ndk'
import { NDKEvent, NDKKind, NDKNip46Signer, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk'
import { CopyIcon, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { auth } from '@/lib/store/auth'

interface NostrConnectQRProps {
    onError?: (error: string) => void
    onSuccess?: () => void
}

export const NOSTR_CONNECT_KEY = 'nostr_connect_url'
export const NOSTR_LOCAL_SIGNER_KEY = 'nostr_local_signer_key'

export function NostrConnectQR({ onError, onSuccess }: NostrConnectQRProps) {
    const [localSigner, setLocalSigner] = useState<NDKPrivateKeySigner | null>(null)
    const [localPubkey, setLocalPubkey] = useState<string | null>(null)
    const [tempSecret, setTempSecret] = useState<string | null>(null)
    const [listening, setListening] = useState(false)
    const [generatingConnectionUrl, setGeneratingConnectionUrl] = useState(false)
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')

    const isLoggingInRef = useRef(false)
    const activeSubscriptionRef = useRef<any>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true

        setGeneratingConnectionUrl(true)
        const signer = NDKPrivateKeySigner.generate()
        setLocalSigner(signer)
        signer.user().then((user) => {
            if (isMountedRef.current) {
                setLocalPubkey(user.pubkey)
                setGeneratingConnectionUrl(false)
            }
        })

        return () => {
            isMountedRef.current = false

            if (activeSubscriptionRef.current) {
                activeSubscriptionRef.current.stop()
                activeSubscriptionRef.current = null
            }

            setLocalSigner(null)
            setLocalPubkey(null)
        }
    }, [])

    const connectionUrl = useMemo(() => {
        if (!localPubkey) return null
        const localMachineIp = import.meta.env.VITE_PUBLIC_HOST || window.location.hostname
        const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
        const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
        const PORT_OR_DEFAULT = import.meta.env.DEV ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`
        const host = location.protocol + '//' + localMachineIp
        const secret = Math.random().toString(36).substring(2, 15)

        setTempSecret(secret)

        const params = new URLSearchParams()
        params.set('relay', relay)
        params.set(
            'metadata',
            JSON.stringify({
                name: 'WaveFunc',
                description: 'Connect with WaveFunc',
                url: host,
                icons: [],
            }),
        )
        params.set('token', secret)

        return `nostrconnect://${localPubkey}?` + params.toString()
    }, [localPubkey])

    const constructBunkerUrl = (event: NDKEvent) => {
        const baseUrl = `bunker://${event.pubkey}?`
        const localMachineIp = import.meta.env.VITE_PUBLIC_HOST || window.location.hostname
        const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
        const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
        const PORT_OR_DEFAULT = import.meta.env.DEV ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

        const params = new URLSearchParams()
        params.set('relay', relay)
        params.set('secret', tempSecret ?? '')

        return baseUrl + params.toString()
    }

    const handleLoginWithSigner = async (event: NDKEvent, logMessage: string) => {
        if (isLoggingInRef.current || !isMountedRef.current) {
            console.log('Login already in progress or component unmounted, skipping duplicate login attempt')
            return
        }

        try {
            isLoggingInRef.current = true

            if (activeSubscriptionRef.current) {
                activeSubscriptionRef.current.stop()
                activeSubscriptionRef.current = null
            }

            if (!isMountedRef.current) return
            setListening(false)

            const bunkerUrl = constructBunkerUrl(event)
            if (!localSigner) {
                throw new Error('No local signer available')
            }

            const ndk = nostrService.getNDK()
            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            const nip46Signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)
            await nip46Signer.blockUntilReady()

            localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey || '')
            localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

            if (!isMountedRef.current) return
            setConnectionStatus('connected')
            await auth.loginWithNostrConnect(nip46Signer)
            if (onSuccess) {
                onSuccess()
            }
        } catch (err) {
            console.error('Error in login flow:', err)
            if (isMountedRef.current) {
                setConnectionStatus('error')
                if (onError) {
                    onError(err instanceof Error ? err.message : 'Connection error')
                }
            }
            isLoggingInRef.current = false
        }
    }

    useEffect(() => {
        if (!localPubkey || !localSigner || !connectionUrl || isLoggingInRef.current) return

        setListening(true)
        setConnectionStatus('connecting')

        const ndk = nostrService.getNDK()
        if (!ndk) {
            console.error('NDK not initialized')
            setConnectionStatus('error')
            if (onError) onError('NDK not initialized')
            return
        }

        const processedRequestIds = new Set<string>()

        const sub = ndk.subscribe(
            {
                kinds: [NDKKind.NostrConnect],
                '#p': [localPubkey],
                since: Math.floor(Date.now() / 1000) - 10,
            },
            { closeOnEose: false },
        )

        activeSubscriptionRef.current = sub

        sub.on('event', async (event) => {
            if (isLoggingInRef.current || !isMountedRef.current) {
                return
            }

            try {
                await event.decrypt(undefined, localSigner)
                const request = JSON.parse(event.content)

                if (request.id && processedRequestIds.has(request.id)) {
                    return
                }

                if (request.id) {
                    processedRequestIds.add(request.id)
                }

                if (request.method === 'connect') {
                    if (request.params && request.params.token === tempSecret) {
                        const response = {
                            id: request.id,
                            result: tempSecret,
                        }

                        const responseEvent = new NDKEvent(ndk)
                        responseEvent.kind = NDKKind.NostrConnect
                        responseEvent.tags = [['p', event.pubkey]]
                        responseEvent.content = JSON.stringify(response)

                        try {
                            await responseEvent.sign(localSigner)
                            // @ts-ignore - The NDK API requires a string pubkey here despite type definitions
                            await responseEvent.encrypt(undefined, localSigner, event.pubkey)
                            await responseEvent.publish()
                        } catch (err) {
                            console.error('Error sending approval:', err)
                            setConnectionStatus('error')
                            if (onError) onError(err instanceof Error ? err.message : 'Error sending approval')
                        }
                    } else {
                        console.log('Token mismatch:', request.params?.token, tempSecret)
                    }
                } else if (request.result === 'ack') {
                    await handleLoginWithSigner(event, 'Starting login flow from ACK response')
                }
            } catch (error) {
                console.error('Failed to process event:', error)
                if (isMountedRef.current) {
                    setConnectionStatus('error')
                    if (onError) onError(error instanceof Error ? error.message : 'Failed to process event')
                }
            }
        })

        const timeout = setTimeout(() => {
            if (isMountedRef.current && connectionStatus !== 'connected' && !isLoggingInRef.current) {
                if (activeSubscriptionRef.current) {
                    activeSubscriptionRef.current.stop()
                    activeSubscriptionRef.current = null
                }
                setConnectionStatus('error')
                setListening(false)
                if (onError) onError('Connection timed out. Please try again.')
            }
        }, 300000) // 5 minutes

        return () => {
            clearTimeout(timeout)
            if (activeSubscriptionRef.current === sub) {
                sub.stop()
                activeSubscriptionRef.current = null
            }
            setListening(false)
        }
    }, [connectionUrl, localPubkey, localSigner, onError, onSuccess, tempSecret])

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).catch((err) => {
            console.warn('Failed to copy:', err)
        })
    }

    return (
        <div className="flex flex-col items-center gap-4 py-4">
            {connectionStatus === 'error' && (
                <div className="bg-destructive/10 text-destructive rounded p-2 mb-2 text-sm w-full">
                    Connection failed. Please try again.
                </div>
            )}

            {generatingConnectionUrl ? (
                <div className="flex flex-col items-center gap-2 py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm text-muted-foreground">Generating connection...</p>
                </div>
            ) : connectionStatus === 'connected' ? (
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
            ) : connectionUrl ? (
                <>
                    <a
                        href={connectionUrl}
                        className="block hover:opacity-90 transition-opacity bg-white p-4 rounded-lg"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <QRCodeSVG
                            value={connectionUrl}
                            size={250}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="L"
                            includeMargin={false}
                        />
                    </a>

                    <div className="flex w-full items-center justify-center">
                        {listening && (
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">Waiting for approval...</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full">
                        <Input value={connectionUrl} readOnly onClick={(e) => e.currentTarget.select()} />
                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(connectionUrl)}>
                            <CopyIcon className="h-4 w-4" />
                        </Button>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm text-muted-foreground">Initializing connection...</p>
                </div>
            )}
        </div>
    )
}
