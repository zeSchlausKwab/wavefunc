import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { authActions, envStore, NOSTR_AUTO_LOGIN, NOSTR_CONNECT_KEY, NOSTR_LOCAL_SIGNER_KEY } from '@wavefunc/common'
import { ndkActions } from '@wavefunc/common'
import { NDKEvent, NDKKind, NDKNip46Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { CopyIcon, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
interface NostrConnectQRProps {
    onError?: (error: string) => void
    onSuccess?: () => void
    autoLogin?: boolean
}

// Global lock to prevent multiple login attempts across component remounts
let globalLoginInProgress = false

export function NostrConnectQR({ onError, onSuccess, autoLogin = true }: NostrConnectQRProps) {
    const { env } = useStore(envStore)
    const [localSigner, setLocalSigner] = useState<NDKPrivateKeySigner | null>(null)
    const [localPubkey, setLocalPubkey] = useState<string | null>(null)
    const [tempSecret, setTempSecret] = useState<string | null>(null)
    const [listening, setListening] = useState(false)
    const [generatingConnectionUrl, setGeneratingConnectionUrl] = useState(false)
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
    const [debugLogs, setDebugLogs] = useState<string[]>([])

    // Component level refs
    const isLoggingInRef = useRef(false)
    const activeSubscriptionRef = useRef<any>(null)
    const isMountedRef = useRef(true)
    const hasTriggeredSuccessRef = useRef(false)
    const connectionTimeoutRef = useRef<number | null>(null)

    // Add debugging function
    const addDebugLog = (message: string) => {
        console.log(`[NostrConnect] ${message}`)
        setDebugLogs((prev) => [...prev.slice(-9), message])
    }

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

            // Clear any pending timeouts
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current)
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

        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current)
            connectionTimeoutRef.current = null
        }

        setListening(false)
    }

    // One-time initialization for connection URL and signer
    useEffect(() => {
        // Skip if login is already happening
        if (globalLoginInProgress) {
            addDebugLog('Global login already in progress, skipping initialization')
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
                addDebugLog(`Generated local pubkey: ${user.pubkey.slice(0, 8)}...${user.pubkey.slice(-4)}`)
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

        // Check if we're in a browser environment
        const isBrowser = typeof window !== 'undefined'

        // Only use window.location if in browser, otherwise fall back to env vars or defaults
        const localMachineIp = env.VITE_PUBLIC_HOST || (isBrowser ? window.location.hostname : 'wavefunc.live')
        const wsProtocol = env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
        const relayPrefix = env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
        const PORT_OR_DEFAULT = env.VITE_PUBLIC_APP_ENV === 'development' ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${PORT_OR_DEFAULT}`

        // Use window.location.protocol if available, otherwise default to https
        const protocol = isBrowser ? window.location.protocol : 'https:'
        const host = protocol + '//' + localMachineIp

        const secret = Math.random().toString(36).substring(2, 15)

        setTempSecret(secret)
        addDebugLog(`Configured relay: ${relay}`)

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

        // Add browser check here too
        const isBrowser = typeof window !== 'undefined'

        const baseUrl = `bunker://${event.pubkey}?`
        const localMachineIp = env.VITE_PUBLIC_HOST || (isBrowser ? window.location.hostname : 'localhost')
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

    // @ts-ignore
    const handleLoginWithSigner = async (event: NDKEvent, logMessage: string) => {
        // Triple-check if login is already in progress (global, component level, or already succeeded)
        if (
            globalLoginInProgress ||
            isLoggingInRef.current ||
            !isMountedRef.current ||
            hasTriggeredSuccessRef.current ||
            !env
        ) {
            addDebugLog('Login already in progress, component unmounted, or env not available')
            return
        }

        try {
            globalLoginInProgress = true
            isLoggingInRef.current = true
            cleanup()

            addDebugLog(`Starting login flow: ${logMessage}`)
            addDebugLog(`Remote pubkey: ${event.pubkey.slice(0, 8)}...${event.pubkey.slice(-4)}`)

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

            addDebugLog(`Created bunker URL: ${bunkerUrl.substring(0, 20)}...`)

            // Create a new NIP46 signer with our connection information
            const nip46Signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)

            // Add timeout for blockUntilReady
            let signerReadyResolved = false
            const readyPromise = nip46Signer.blockUntilReady().then(() => {
                signerReadyResolved = true
                addDebugLog('NIP46 signer is ready')
                return true
            })

            const timeoutPromise = new Promise<boolean>((resolve) => {
                setTimeout(() => {
                    if (!signerReadyResolved) {
                        addDebugLog('NIP46 signer timeout - proceeding anyway')
                        resolve(true) // Proceed anyway to see if things work
                    }
                    resolve(true)
                }, 5000)
            })

            await Promise.race([readyPromise, timeoutPromise])

            localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey || '')
            localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

            // Set auto-login preference
            if (autoLogin) {
                localStorage.setItem(NOSTR_AUTO_LOGIN, 'true')
            } else {
                localStorage.removeItem(NOSTR_AUTO_LOGIN)
            }

            if (!isMountedRef.current) {
                return
            }

            setConnectionStatus('connected')
            addDebugLog('Starting auth login with NIP46')
            await authActions.loginWithNip46(bunkerUrl, localSigner, autoLogin)

            triggerSuccess()
        } catch (err) {
            console.error('Error in login flow:', err)
            addDebugLog(`Error: ${err instanceof Error ? err.message : String(err)}`)

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
        addDebugLog('Starting to listen for Nostr Connect events')

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
                addDebugLog('Login in progress or component unmounted, ignoring event')
                return
            }

            try {
                addDebugLog(`Received event: ${event.kind} from ${event.pubkey.slice(0, 8)}`)

                await event.decrypt(undefined, localSigner)
                let request
                try {
                    request = JSON.parse(event.content)
                    addDebugLog(`Parsed request: ${JSON.stringify(request).substring(0, 50)}...`)
                } catch (parseErr) {
                    addDebugLog(`Failed to parse event content: ${event.content.substring(0, 30)}...`)
                    console.error('Failed to parse event content:', parseErr)
                    return
                }

                // For mobile clients, sometimes the event format differs
                // Handle both possible formats
                if (request.method === 'connect') {
                    if (request.id && processedRequestIds.has(request.id)) {
                        addDebugLog(`Skipping already processed connect request: ${request.id}`)
                        return
                    }

                    if (request.id) {
                        processedRequestIds.add(request.id)
                    }

                    // Check if token matches what we expect
                    if (request.params && request.params.token === tempSecret) {
                        addDebugLog('Received matching connect request, sending response')

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
                            addDebugLog('Connect response published')

                            // Important: Some mobile clients don't send a separate 'ack' but expect
                            // us to proceed with login after the connect response
                            setTimeout(() => {
                                if (
                                    !hasTriggeredSuccessRef.current &&
                                    isMountedRef.current &&
                                    !isLoggingInRef.current
                                ) {
                                    addDebugLog('No ack received, trying to login anyway')
                                    handleLoginWithSigner(event, 'Auto-proceeding after connect without ack')
                                }
                            }, 2000)
                        } catch (err) {
                            console.error('Error sending approval:', err)
                            addDebugLog(`Error sending approval: ${err instanceof Error ? err.message : String(err)}`)
                            if (isMountedRef.current && !hasTriggeredSuccessRef.current) {
                                setConnectionStatus('error')
                                if (onError) onError(err instanceof Error ? err.message : 'Error sending approval')
                            }
                        }
                    } else {
                        addDebugLog(`Token mismatch: ${request.params?.token} vs expected ${tempSecret}`)
                    }
                } else if (
                    request.result === 'ack' ||
                    request.method === 'ack' ||
                    // Handle different variations of ack responses that mobile clients might send
                    (request.result && (typeof request.result === 'string' || typeof request.result === 'object'))
                ) {
                    addDebugLog('Received ack or result that may be an ack')

                    if (processedAckIds.has(event.id)) {
                        addDebugLog(`Skipping already processed ACK: ${event.id}`)
                        return
                    }

                    processedAckIds.add(event.id)
                    await handleLoginWithSigner(event, 'Starting login flow from ACK response')
                }
            } catch (error) {
                console.error('Failed to process event:', error)
                addDebugLog(`Failed to process event: ${error instanceof Error ? error.message : String(error)}`)
                if (isMountedRef.current && !hasTriggeredSuccessRef.current) {
                    setConnectionStatus('error')
                    if (onError) onError(error instanceof Error ? error.message : 'Failed to process event')
                }
            }
        })

        // Set a more reasonable timeout (1 minute) and add a retry option
        const shortTimeout = setTimeout(() => {
            if (
                isMountedRef.current &&
                !hasTriggeredSuccessRef.current &&
                connectionStatus !== 'connected' &&
                !isLoggingInRef.current
            ) {
                addDebugLog('Short timeout reached - continuing to wait but showing warning')
                // Don't reset everything yet, just show a warning
                setDebugLogs((prev) => [
                    ...prev,
                    "Warning: Taking longer than expected. Please make sure you've approved in your wallet.",
                ])
            }
        }, 60000) // 1 minute warning

        // Longer timeout will actually stop the connection
        connectionTimeoutRef.current = window.setTimeout(() => {
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
            clearTimeout(shortTimeout)
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current)
                connectionTimeoutRef.current = null
            }
            cleanup()
        }
    }, [connectionUrl, localPubkey, localSigner, onError, onSuccess, tempSecret])

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).catch((err) => {
            console.warn('Failed to copy:', err)
        })
    }

    const resetConnection = () => {
        cleanup()
        setConnectionStatus('idle')
        setGeneratingConnectionUrl(true)
        setTempSecret(null)
        setLocalPubkey(null)
        setLocalSigner(null)
        setDebugLogs([])
        globalLoginInProgress = false
        isLoggingInRef.current = false
        hasTriggeredSuccessRef.current = false

        // Generate a new signer
        const signer = NDKPrivateKeySigner.generate()
        setLocalSigner(signer)

        signer
            .user()
            .then((user) => {
                if (!isMountedRef.current) return
                setLocalPubkey(user.pubkey)
                setGeneratingConnectionUrl(false)
                addDebugLog(`Reset: Generated new local pubkey: ${user.pubkey.slice(0, 8)}...${user.pubkey.slice(-4)}`)
            })
            .catch((err) => {
                console.error('Failed to get user pubkey:', err)
                if (!isMountedRef.current) return
                setConnectionStatus('error')
                onError?.('Failed to initialize connection')
            })
    }

    return (
        <div className="flex flex-col items-center gap-4 py-4">
            {connectionStatus === 'error' && (
                <div className="bg-destructive/10 text-destructive rounded p-2 mb-2 text-sm w-full">
                    Connection failed. Please try again.
                    <Button variant="outline" size="sm" className="w-full mt-2" onClick={resetConnection}>
                        Reset Connection
                    </Button>
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

                    {debugLogs.length > 0 && (
                        <div className="w-full mt-4 text-xs text-muted-foreground border rounded p-2 max-h-32 overflow-y-auto">
                            <p className="font-medium mb-1">Connection logs:</p>
                            {debugLogs.map((log, i) => (
                                <div key={i} className="truncate">
                                    {log}
                                </div>
                            ))}
                        </div>
                    )}
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
