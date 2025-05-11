import { Button } from '@wavefunc/ui/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@wavefunc/ui/components/ui/dialog'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wavefunc/ui/components/ui/tabs'
import { ndkActions } from '@wavefunc/common'
import { walletStore } from '@wavefunc/common'
import NDK, {
    NDKEvent,
    NDKPrivateKeySigner,
    NDKSubscription,
    NDKSubscriptionCacheUsage,
    NDKZapper,
    type LnPaymentInfo,
    type NDKPaymentConfirmationLN,
    type NDKZapDetails,
} from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import { Copy, Loader2, Wallet, Zap, AlertTriangle } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@wavefunc/ui/components/ui/alert'

interface ZapDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    event: NDKEvent
    onZapComplete?: (zapEvent?: NDKEvent) => void
}

export function ZapDialog({ isOpen, onOpenChange, event, onZapComplete }: ZapDialogProps) {
    const [amount, setAmount] = useState<number>(3)
    const [loading, setLoading] = useState<boolean>(false)
    const [invoice, setInvoice] = useState<string | null>(null)
    const [lightningAddress, setLightningAddress] = useState<string | null>(null)
    const [zapperReady, setZapperReady] = useState<boolean>(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [paymentPending, setPaymentPending] = useState<boolean>(false)
    const [paymentComplete, setPaymentComplete] = useState<boolean>(false)
    const [nwcZapStatus, setNwcZapStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
    const [nwcZapError, setNwcZapError] = useState<string | null>(null)

    const zapSubscriptionRef = useRef<NDKSubscription | null>(null)
    const startTimeRef = useRef<number>(0)
    const resolvePaymentRef = useRef<((value: NDKPaymentConfirmationLN) => void) | null>(null)

    const walletState = useStore(walletStore)

    useEffect(() => {
        if (isOpen) {
            fetchRecipientDetails()
        } else {
            resetState()
        }

        return () => {
            cleanupSubscription()
        }
    }, [isOpen, event])

    const resetState = () => {
        setInvoice(null)
        setPaymentPending(false)
        setPaymentComplete(false)
        setErrorMessage(null)
        setNwcZapStatus('idle')
        setNwcZapError(null)
        cleanupSubscription()
        resolvePaymentRef.current = null
    }

    const cleanupSubscription = () => {
        if (zapSubscriptionRef.current) {
            zapSubscriptionRef.current.stop()
            zapSubscriptionRef.current = null
        }
    }

    const fetchRecipientDetails = useCallback(async () => {
        if (!event?.pubkey) return

        try {
            setLoading(true)
            setErrorMessage(null)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const user = ndk.getUser({ pubkey: event.pubkey })

            try {
                const zapInfo = await user.getZapInfo()

                if (zapInfo.size > 0) {
                    setZapperReady(true)

                    const nip57Info = zapInfo.get('nip57')
                    const nip61Info = zapInfo.get('nip61')

                    if (nip57Info && 'lud16' in nip57Info && nip57Info.lud16) {
                        setLightningAddress(nip57Info.lud16)
                    } else if (nip61Info && 'lud16' in nip61Info && nip61Info.lud16) {
                        setLightningAddress(nip61Info.lud16)
                    }
                } else {
                    setZapperReady(false)
                    setErrorMessage('User cannot receive zaps')
                }
            } catch (err) {
                console.warn('Could not fetch zap info:', err)
                setZapperReady(false)
                setErrorMessage('Failed to fetch user payment information')
            }
        } catch (error) {
            console.error('Failed to fetch user details:', error)
            setErrorMessage('Failed to fetch user payment information')
            setZapperReady(false)
        } finally {
            setLoading(false)
        }
    }, [event])

    const subscribeToZapReceipts = useCallback(
        (ndk: NDK) => {
            startTimeRef.current = Math.floor(Date.now() / 1000)

            const filter = {
                kinds: [9735],
                '#e': [event.id],
                since: startTimeRef.current - 5,
            }

            console.log('filter', filter)

            const sub = ndk.subscribe(filter, {
                closeOnEose: false,
                cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            })

            console.log('sub', sub)

            sub.on('event', (zapEvent: NDKEvent) => {
                const descriptionTag = zapEvent.tags.find((t) => t[0] === 'description')?.[1]
                let isOurZap = false

                if (descriptionTag) {
                    try {
                        const zapRequest = JSON.parse(descriptionTag)
                        isOurZap = zapRequest.tags?.some(
                            (tag: string[]) =>
                                (tag[0] === 'e' && tag[1] === event.id) ||
                                (tag[0] === 'a' && tag[1]?.includes(event.id)),
                        )
                    } catch (error) {
                        console.error('Failed to parse zap request:', error)
                    }
                }

                const isRecentZap = zapEvent.created_at && zapEvent.created_at >= startTimeRef.current - 10

                if (isOurZap || isRecentZap) {
                    setPaymentComplete(true)
                    setPaymentPending(false)
                    setNwcZapStatus('success')

                    if (resolvePaymentRef.current) {
                        const confirmation: NDKPaymentConfirmationLN = {
                            preimage: zapEvent.tags.find((t) => t[0] === 'preimage')?.[1] || 'unknown',
                        }
                        resolvePaymentRef.current(confirmation)
                        resolvePaymentRef.current = null
                    }

                    onZapComplete?.(zapEvent)
                    toast.success('Zap successful! 🤙')

                    setTimeout(() => {
                        onOpenChange(false)
                        sub.stop()
                    }, 1500)
                }
            })

            return sub
        },
        [event, onZapComplete, onOpenChange],
    )

    const generateInvoice = async () => {
        try {
            setLoading(true)
            setInvoice(null)
            setErrorMessage(null)
            setPaymentPending(false)
            setPaymentComplete(false)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const sub = subscribeToZapReceipts(ndk)
            console.log('sub', sub)
            zapSubscriptionRef.current = sub

            const lnPay = async (payment: NDKZapDetails<LnPaymentInfo>) => {
                setInvoice(payment.pr)
                setLoading(false)
                setPaymentPending(true)

                return new Promise<NDKPaymentConfirmationLN>((resolve) => {
                    resolvePaymentRef.current = resolve
                })
            }

            const zapper = new NDKZapper(event, amount * 1000, 'msats', {
                comment: 'Zap from WaveFunc',
                lnPay,
            })

            // if the zappers ndk has no signer, set the signer to the wallet
            if (!zapper.ndk.signer) {
                zapper.ndk.signer = NDKPrivateKeySigner.generate()
            }

            await zapper.zap()
        } catch (error) {
            console.error('Failed to generate invoice:', error)
            setErrorMessage('Failed to generate invoice: ' + (error instanceof Error ? error.message : 'Unknown error'))
            setLoading(false)
            setInvoice(null)
            cleanupSubscription()
        }
    }

    const sendNwcZap = async () => {
        try {
            // Reset states
            setNwcZapStatus('sending')
            setNwcZapError(null)
            setErrorMessage(null)

            // Make sure wallet is connected and is NWC type
            if (!walletState.wallet || walletState.walletData?.type !== 'nwc') {
                throw new Error('NWC wallet not connected')
            }

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Set up subscription to listen for zap confirmation
            const sub = subscribeToZapReceipts(ndk)
            zapSubscriptionRef.current = sub

            // Configure NDK to use the wallet
            // @ts-ignore
            ndk.wallet = walletState.wallet

            // Create zapper to send zap through NWC
            const zapper = new NDKZapper(event, amount * 1000, 'msats', {
                comment: 'Zap from WaveFunc via NWC',
            })

            // Send the zap
            await zapper.zap()

            // If we get here, the zap was sent successfully through the wallet
            // The zap receipt will be handled by the subscription
            toast.success('Zap sent through wallet!')
        } catch (error) {
            console.error('Failed to send zap with NWC:', error)
            setNwcZapStatus('error')
            setNwcZapError(error instanceof Error ? error.message : 'Failed to send zap using wallet')
            cleanupSubscription()
        }
    }

    const handlePaymentComplete = () => {
        if (!resolvePaymentRef.current) return

        setPaymentComplete(true)
        setPaymentPending(false)

        toast.success('Payment marked as complete! Waiting for confirmation...')

        setTimeout(() => {
            if (resolvePaymentRef.current) {
                const confirmation: NDKPaymentConfirmationLN = {
                    preimage: 'manual-confirm-' + Math.random().toString(36).substring(2, 8),
                }
                resolvePaymentRef.current(confirmation)
                resolvePaymentRef.current = null

                onZapComplete?.()
                onOpenChange(false)
                cleanupSubscription()
            }
        }, 10000)
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard')
    }

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10)
        if (!isNaN(value) && value > 0) {
            setAmount(value)
        }
    }

    const renderLoading = () => (
        <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">Loading payment information...</p>
        </div>
    )

    const renderError = () => (
        <div className="py-6">
            <p className="text-red-500">{errorMessage}</p>
            <p className="text-sm text-muted-foreground mt-2">
                The creator needs to set up a Lightning address in their profile to receive zaps.
            </p>
        </div>
    )

    const renderInvoiceButton = () => (
        <Button onClick={generateInvoice} className="w-full" disabled={loading || !zapperReady}>
            {loading ? (
                <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating invoice...
                </>
            ) : (
                'Generate Invoice'
            )}
        </Button>
    )

    const renderInvoiceQR = () => (
        <div className="flex flex-col items-center space-y-4">
            <div
                className="bg-white p-6 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => invoice && copyToClipboard(invoice)}
                title="Click to copy invoice"
            >
                <QRCodeSVG
                    value={invoice || ''}
                    size={240}
                    level="H"
                    includeMargin={true}
                    className="mx-auto pointer-events-none"
                />
            </div>
            <div className="flex flex-col w-full space-y-2">
                <p className="text-center text-sm mb-2">Scan with your Lightning wallet or click QR to copy</p>
                <div className="flex items-center">
                    <Input value={invoice || ''} readOnly className="font-mono text-xs" />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => invoice && copyToClipboard(invoice)}
                        className="ml-2"
                        title="Copy to clipboard"
                    >
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
                {lightningAddress && (
                    <p className="text-sm text-center text-muted-foreground mt-1">Zap to: {lightningAddress}</p>
                )}
                {paymentPending && !paymentComplete && (
                    <p className="text-sm text-center text-amber-500 mt-2 animate-pulse">Waiting for payment...</p>
                )}
                {paymentComplete && (
                    <p className="text-sm text-center text-green-500 mt-2">Payment detected! Processing zap...</p>
                )}
            </div>
        </div>
    )

    const renderNWCWallet = () => {
        // Check if wallet is connected
        const isNwcWalletConnected = walletState.isConnected && walletState.walletData?.type === 'nwc'

        if (!isNwcWalletConnected) {
            return (
                <div className="py-6 text-center">
                    <div className="flex flex-col items-center space-y-4">
                        <Wallet className="h-12 w-12 text-muted-foreground" />
                        <div>
                            <p className="text-muted-foreground">No NWC wallet connected</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Connect a Nostr Wallet in Settings to use this feature
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                onOpenChange(false)
                                // Check if window exists before accessing it (for SSR)
                                if (typeof window !== 'undefined') {
                                    window.location.href = '/settings?tab=nwc'
                                }
                            }}
                        >
                            Connect Wallet
                        </Button>
                    </div>
                </div>
            )
        }

        return (
            <div className="py-4 space-y-6">
                <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Connected Wallet</span>
                        <span className="text-sm">
                            {walletState.balance !== undefined ? `${walletState.balance} sats` : 'Unknown balance'}
                        </span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Amount to Zap</span>
                            <span className="text-sm">{amount} sats</span>
                        </div>
                        <Input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={amount}
                            onChange={(e) => setAmount(parseInt(e.target.value, 10))}
                            className="w-full"
                        />
                    </div>

                    {nwcZapStatus === 'error' && nwcZapError && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{nwcZapError}</AlertDescription>
                        </Alert>
                    )}

                    {nwcZapStatus === 'success' && (
                        <Alert className="bg-green-50 border-green-200">
                            <Zap className="h-4 w-4 text-green-500" />
                            <AlertTitle>Zap Successful</AlertTitle>
                            <AlertDescription>Your zap was sent successfully!</AlertDescription>
                        </Alert>
                    )}

                    <Button
                        onClick={sendNwcZap}
                        disabled={nwcZapStatus === 'sending' || !zapperReady}
                        className="w-full"
                    >
                        {nwcZapStatus === 'sending' ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Sending zap...
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4 mr-2" />
                                Send Zap with Wallet
                            </>
                        )}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Send a Zap</DialogTitle>
                    <DialogDescription>Send Lightning payment to support the creator</DialogDescription>
                </DialogHeader>

                {loading ? (
                    renderLoading()
                ) : errorMessage ? (
                    renderError()
                ) : (
                    <>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount (sats)</Label>
                                <Input id="amount" type="number" min="1" value={amount} onChange={handleAmountChange} />
                            </div>

                            <Tabs defaultValue="lightning" className="w-full">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="lightning">
                                        <Zap className="h-4 w-4 mr-2" />
                                        Invoice
                                    </TabsTrigger>
                                    <TabsTrigger value="nwc">
                                        <Wallet className="h-4 w-4 mr-2" />
                                        NWC
                                    </TabsTrigger>
                                    <TabsTrigger value="cashu">
                                        <Copy className="h-4 w-4 mr-2" />
                                        Cashu
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="lightning" className="space-y-4 py-4">
                                    {!invoice ? renderInvoiceButton() : renderInvoiceQR()}
                                </TabsContent>

                                <TabsContent value="nwc" className="py-4">
                                    {renderNWCWallet()}
                                </TabsContent>

                                <TabsContent value="cashu" className="py-4">
                                    <div className="text-center py-8">
                                        <p className="text-muted-foreground">Cashu token support coming soon.</p>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </>
                )}

                <DialogFooter className="sm:justify-between">
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">
                            Cancel
                        </Button>
                    </DialogClose>
                    {invoice && !paymentComplete && (
                        <Button type="button" onClick={handlePaymentComplete} disabled={paymentComplete}>
                            I've Paid
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
