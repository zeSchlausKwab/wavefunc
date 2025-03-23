import React, { useState, useEffect } from 'react'
import { NDKEvent, NDKKind, NDKPrivateKeySigner, NDKNip46Signer, NDKUser } from '@nostr-dev-kit/ndk'
import { nostrService } from '@/lib/services/ndk'
import { auth } from '@/lib/store/auth'
import { generateSecretToken } from '@/lib/utils'

import { QRCodeSVG } from 'qrcode.react'

interface NostrConnectProps {
    onSuccess?: () => void
    onError?: (error: string) => void
    onCancel?: () => void
}

const STORAGE_KEYS = {
    SESSION_DATA: 'nostr_connect_session',
    TOKEN: 'nostr_connect_token',
    CLIENT_KEY: 'nostr_connect_client_key',
}

export function NostrConnect({ onSuccess, onError, onCancel }: NostrConnectProps) {
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
    const [status, setStatus] = useState<'generating' | 'ready' | 'connecting' | 'connected' | 'error'>('generating')
    const [error, setError] = useState<string | null>(null)
    const [subscription, setSubscription] = useState<any>(null)

    useEffect(() => {
        return () => {
            if (subscription) {
                subscription.stop()
            }
        }
    }, [subscription])

    useEffect(() => {
        initializeConnection()
    }, [])

    const initializeConnection = async () => {
        try {
            setStatus('generating')

            const signer = NDKPrivateKeySigner.generate()

            const ndk = nostrService.getNDK()
            if (!ndk) throw new Error('NDK not initialized')

            const user = await signer.user()
            const clientPubkey = user.pubkey

            const token = generateSecretToken(12)
            localStorage.setItem(STORAGE_KEYS.TOKEN, token)

            const appMetadata = {
                name: 'Wavef(u)nc',
                description: 'Connect with Wavef(u)nc',
                url: window.location.origin,
                icons: [],
            }

            const localMachineIp = import.meta.env.VITE_PUBLIC_HOST || window.location.hostname
            const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
            const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
            const portOrDefault = import.meta.env.DEV ? ':3002' : ''
            const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${portOrDefault}`

            const params = new URLSearchParams()
            params.set('relay', relay)
            params.set('metadata', JSON.stringify(appMetadata))
            params.set('token', token)

            const uri = `nostrconnect://${clientPubkey}?${params.toString()}`
            setQrCodeUrl(uri)
            setStatus('ready')

            listenForConnections(clientPubkey, token, signer)
        } catch (err) {
            console.error('Error initializing connection:', err)
            setStatus('error')
            const errMessage = err instanceof Error ? err.message : 'Failed to initialize connection'
            setError(errMessage)
            onError?.(errMessage)
        }
    }

    const listenForConnections = (clientPubkey: string, token: string, signer: NDKPrivateKeySigner) => {
        try {
            const ndk = nostrService.getNDK()
            if (!ndk) throw new Error('NDK not initialized')

            setStatus('connecting')

            const sub = ndk.subscribe(
                {
                    kinds: [NDKKind.NostrConnect],
                    '#p': [clientPubkey],
                    since: Math.floor(Date.now() / 1000) - 10,
                },
                { closeOnEose: false },
            )

            setSubscription(sub)

            sub.on('event', async (event: NDKEvent) => {
                try {
                    await event.decrypt(undefined, signer)

                    const request = JSON.parse(event.content)

                    if (request.method === 'connect') {
                        if (request.params && request.params.token === token) {
                            try {
                                const response = {
                                    id: request.id,
                                    result: token,
                                }

                                const responseEvent = new NDKEvent(ndk)
                                responseEvent.kind = NDKKind.NostrConnect
                                responseEvent.tags = [['p', event.pubkey]]
                                responseEvent.content = JSON.stringify(response)
                                await responseEvent.encrypt(undefined, signer, event.pubkey)
                                await responseEvent.sign()
                                await responseEvent.publish()

                                const bunkerUrl = constructBunkerUrl(event, token)
                                const nip46Signer = new NDKNip46Signer(ndk, bunkerUrl, signer)
                                await nip46Signer.blockUntilReady()

                                localStorage.setItem('nostr_local_signer_key', signer.privateKey || '')
                                localStorage.setItem('nostr_connect_url', bunkerUrl)

                                await auth.loginWithNostrConnect(nip46Signer)

                                sub.stop()
                                setStatus('connected')
                                onSuccess?.()
                            } catch (err) {
                                console.error('Error establishing connection:', err)
                                throw err
                            }
                        } else {
                            console.log('Token mismatch:', request.params?.token, token)
                        }
                    }
                } catch (error) {
                    console.error('Failed to process event:', error)
                    setStatus('error')
                    const errorMsg = error instanceof Error ? error.message : 'Failed to connect'
                    setError(errorMsg)
                    onError?.(errorMsg)
                }
            })

            setTimeout(() => {
                if (status !== 'connected') {
                    sub.stop()
                    if (status === 'connecting') {
                        setStatus('error')
                        setError('Connection timed out. Please try again.')
                        onError?.('Connection timed out')
                    }
                }
            }, 300000)
        } catch (err) {
            console.error('Error setting up listener:', err)
            setStatus('error')
            const errMessage = err instanceof Error ? err.message : 'Failed to listen for connections'
            setError(errMessage)
            onError?.(errMessage)
        }
    }

    const constructBunkerUrl = (event: NDKEvent, token: string): string => {
        const signerPubkey = event.pubkey

        const baseUrl = `bunker://${signerPubkey}?`

        const localMachineIp = import.meta.env.VITE_PUBLIC_HOST || window.location.hostname
        const wsProtocol = import.meta.env.DEV ? 'ws' : 'wss'
        const relayPrefix = import.meta.env.DEV ? '' : 'relay.'
        const portOrDefault = import.meta.env.DEV ? ':3002' : ''
        const relay = `${wsProtocol}://${relayPrefix}${localMachineIp}${portOrDefault}`

        const params = new URLSearchParams()
        params.set('relay', relay)
        params.set('secret', token)

        return baseUrl + params.toString()
    }

    const handleCancel = () => {
        if (subscription) {
            subscription.stop()
        }
        onCancel?.()
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).catch((err) => {
            console.warn('Failed to copy:', err)
        })
    }

    return (
        <div className="flex flex-col items-center gap-4 py-4">
            {error && <div className="bg-destructive/10 text-destructive rounded p-2 mb-2 text-sm w-full">{error}</div>}

            {status === 'generating' && (
                <div className="flex flex-col items-center gap-2 py-8">
                    <div className="h-8 w-8 animate-spin">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">Generating connection...</p>
                </div>
            )}

            {(status === 'ready' || status === 'connecting') && qrCodeUrl && (
                <>
                    <a
                        href={qrCodeUrl}
                        className="block hover:opacity-90 transition-opacity bg-white p-4 rounded-lg"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <div className="qr-code-container">
                            {/* Directly using QRCodeSVG component */}
                            <QRCodeSVG
                                value={qrCodeUrl}
                                size={250}
                                bgColor="#ffffff"
                                fgColor="#000000"
                                level="L"
                                includeMargin={false}
                            />
                        </div>
                    </a>

                    <div className="flex w-full items-center justify-center">
                        {status === 'connecting' && (
                            <div className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                </div>
                                <span className="text-sm">Waiting for approval...</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full">
                        <input
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={qrCodeUrl}
                            readOnly
                            onClick={(e) => e.currentTarget.select()}
                        />
                        <button
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10"
                            onClick={() => copyToClipboard(qrCodeUrl)}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                            >
                                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                            </svg>
                        </button>
                    </div>

                    <button
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2 mt-2"
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>
                </>
            )}

            {status === 'connected' && (
                <div className="flex flex-col items-center gap-2 py-8">
                    <p className="text-sm text-green-500 font-medium">Connected successfully!</p>
                    <p className="text-sm text-muted-foreground">Logging in...</p>
                </div>
            )}
        </div>
    )
}
