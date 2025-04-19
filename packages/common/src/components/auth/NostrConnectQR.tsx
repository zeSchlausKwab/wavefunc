import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { authActions, NOSTR_CONNECT_KEY, NOSTR_LOCAL_SIGNER_KEY } from '@wavefunc/common'
import { useEnv } from '@wavefunc/common'
import { ndkActions } from '@wavefunc/common'
import { NDKEvent, NDKKind, NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { CopyIcon, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useRef, useState } from 'react'

interface NostrConnectQRProps {
    onError?: (error: string) => void
    onSuccess?: () => void
}

// Global lock to prevent multiple login attempts across component remounts
let globalLoginInProgress = false

export function NostrConnectQR({ onError, onSuccess }: NostrConnectQRProps) {
    const { env, initialize } = useEnv()
    const [localSigner, setLocalSigner] = useState<NDKPrivateKeySigner | null>(null)
    const [localPubkey, setLocalPubkey] = useState<string | null>(null)
    const [tempSecret, setTempSecret] = useState<string | null>(null)
    const [listening, setListening] = useState(false)
    const [generatingConnectionUrl, setGeneratingConnectionUrl] = useState(false)
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')

    // Component level refs
    const isLoggingInRef = useRef(false)
    const activeSubscriptionRef = useRef<any>(null)
    const isMountedRef = useRef(true)
    const hasTriggeredSuccessRef = useRef(false)

    // Initialize env store if needed
    useEffect(() => {
        if (!env) {
            initialize().catch((err) => {
                console.error('Failed to initialize env:', err)
                if (onError) onError('Failed to initialize environment')
            })
        }
    }, [env, initialize, onError])

    // Ensure we clean up any previous login attempts on mount
    useEffect(() => {
        // Reset global lock if it's been stuck
        if (!document.querySelector('[data-nostr-connect-active="true"]')) {
            globalLoginInProgress = false
        }

        // Mark this component as active
        isMountedRef.current = true
        document.body.setAttribute('data-nostr-connect-active', 'true')

        return () => {
            // Mark component as unmounted to prevent any state updates
            isMountedRef.current = false
            document.body.removeAttribute('data-nostr-connect-active')

            // Ensure we're doing a thorough cleanup
            if (activeSubscriptionRef.current) {
                try {
                    activeSubscriptionRef.current.stop()
                } catch (e) {
                    console.error('Error stopping subscription:', e)
                }
                activeSubscriptionRef.current = null
            }
        }
    }, [])

    const cleanup = () => {
        if (!isMountedRef.current) return

        isLoggingInRef.current = false

        if (activeSubscriptionRef.current) {
            try {
                activeSubscriptionRef.current.stop()
            } catch (e) {
                console.error('Error stopping subscription:', e)
            }
            activeSubscriptionRef.current = null
        }

        setListening(false)
    }

    // One-time initialization for connection URL and signer
    useEffect(() => {
        // Skip if login is already happening
        if (globalLoginInProgress) {
            console.log('Global login already in progress, skipping initialization')
            return
        }

        setGeneratingConnectionUrl(true)
        const signer = NDKPrivateKeySigner.generate()
        setLocalSigner(signer)

        signer
            .user()
            .then((user) => {
                if (!isMountedRef.current) return
                setLocalPubkey(user.pubkey)
                setGeneratingConnectionUrl(false)
            })
            .catch((err) => {
                console.error('Failed to get user pubkey:', err)
                if (!isMountedRef.current) return
                setConnectionStatus('error')
                onError?.('Failed to initialize connection')
            })
    }, [])

    const connectionUrl = useMemo(() => {
        if (!localPubkey || !env) return null

        const localMachineIp = env.VITE_PUBLIC_HOST || window.location.hostname
        const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
        const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
        const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
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
    }, [localPubkey, env])

    const constructBunkerUrl = (event: NDKEvent) => {
        if (!env) return null

        const baseUrl = `bunker://${event.pubkey}?`
        const localMachineIp = env.VITE_PUBLIC_HOST || window.location.hostname
        const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
        const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
        const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

        const params = new URLSearchParams()
        params.set('relay', relay)
        params.set('secret', tempSecret ?? '')

        return baseUrl + params.toString()
    }

    const triggerSuccess = () => {
        if (hasTriggeredSuccessRef.current) {
            return
        }

        hasTriggeredSuccessRef.current = true
        cleanup()

        isMountedRef.current = false
        globalLoginInProgress = false

        if (onSuccess) {
            setTimeout(() => {
                onSuccess()
            }, 0)
        }
    }

    const handleLoginWithSigner = async (event: NDKEvent, logMessage: string) => {
        // Triple-check if login is already in progress (global, component level, or already succeeded)
        if (
            globalLoginInProgress ||
            isLoggingInRef.current ||
            !isMountedRef.current ||
            hasTriggeredSuccessRef.current ||
            !env
        ) {
            console.log('Login already in progress, component unmounted, or env not available')
            return
        }

        try {
            globalLoginInProgress = true
            isLoggingInRef.current = true
            cleanup()

            const bunkerUrl = constructBunkerUrl(event)
            if (!bunkerUrl) {
                throw new Error('Failed to construct bunker URL')
            }
            if (!localSigner) {
                throw new Error('No local signer available')
            }

            const ndk = ndkActions.getNDK()
            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            const nip46Signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)
            await nip46Signer.blockUntilReady()

            localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey || '')
            localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

            if (!isMountedRef.current) {
                return
            }

            setConnectionStatus('connected')
            await authActions.loginWithNip46(bunkerUrl, localSigner)

            triggerSuccess()
        } catch (err) {
            console.error('Error in login flow:', err)

            if (isMountedRef.current) {
                setConnectionStatus('error')
                if (onError) {
                    onError(err instanceof Error ? err.message : 'Connection error')
                }
            }

            isLoggingInRef.current = false
            globalLoginInProgress = false
        }
    }

    useEffect(() => {
        if (
            !localPubkey ||
            !localSigner ||
            !connectionUrl ||
            isLoggingInRef.current ||
            globalLoginInProgress ||
            hasTriggeredSuccessRef.current ||
            !isMountedRef.current
        ) {
            return
        }
        
        setListening(true)
        setConnectionStatus('connecting')

        const ndk = ndkActions.getNDK()
        if (!ndk) {
            console.error('NDK not initialized')
            setConnectionStatus('error')
            if (onError) onError('NDK not initialized')
            return
        }

        const processedRequestIds = new Set<string>()
        const processedAckIds = new Set<string>()

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
            if (
                globalLoginInProgress ||
                isLoggingInRef.current ||
                !isMountedRef.current ||
                hasTriggeredSuccessRef.current
            ) {
                console.log('Login in progress or component unmounted, ignoring event')
                return
            }

            try {
                await event.decrypt(undefined, localSigner)
                const request = JSON.parse(event.content)

                if (request.method === 'connect') {
                    if (request.id && processedRequestIds.has(request.id)) {
                        console.log('Skipping already processed connect request:', request.id)
                        return
                    }

                    if (request.id) {
                        processedRequestIds.add(request.id)
                    }

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
                            if (isMountedRef.current && !hasTriggeredSuccessRef.current) {
                                setConnectionStatus('error')
                                if (onError) onError(err instanceof Error ? err.message : 'Error sending approval')
                            }
                        }
                    } else {
                        console.log('Token mismatch:', request.params?.token, tempSecret)
                    }
                } else if (request.result === 'ack') {
                    if (processedAckIds.has(event.id)) {
                        console.log('Skipping already processed ACK:', event.id)
                        return
                    }

                    processedAckIds.add(event.id)

                    await handleLoginWithSigner(event, 'Starting login flow from ACK response')
                }
            } catch (error) {
                console.error('Failed to process event:', error)
                if (isMountedRef.current && !hasTriggeredSuccessRef.current) {
                    setConnectionStatus('error')
                    if (onError) onError(error instanceof Error ? error.message : 'Failed to process event')
                }
            }
        })

        const timeout = setTimeout(() => {
            if (
                isMountedRef.current &&
                !hasTriggeredSuccessRef.current &&
                connectionStatus !== 'connected' &&
                !isLoggingInRef.current
            ) {
                cleanup()
                setConnectionStatus('error')
                if (onError) onError('Connection timed out. Please try again.')
            }
        }, 300000) // 5 minutes

        return () => {
            clearTimeout(timeout)
            cleanup()
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
