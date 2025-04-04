import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ndkActions } from '@/lib/store/ndk'
import {
    NDKEvent,
    NDKSubscription,
    NDKSubscriptionCacheUsage,
    NDKZapper,
    type LnPaymentInfo,
    type NDKPaymentConfirmationLN,
    type NDKUser,
    type NDKZapDetails,
} from '@nostr-dev-kit/ndk'
import { Copy, Loader2, Wallet, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

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
    const [recipientUser, setRecipientUser] = useState<NDKUser | null>(null)
    const [lightningAddress, setLightningAddress] = useState<string | null>(null)
    const [zapperReady, setZapperReady] = useState<boolean>(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [paymentPending, setPaymentPending] = useState<boolean>(false)
    const [paymentComplete, setPaymentComplete] = useState<boolean>(false)
    const [zapSubscription, setZapSubscription] = useState<NDKSubscription | null>(null)
    const [paidAt, setPaidAt] = useState<number | null>(null)

    // Clear state when dialog opens/closes
    useEffect(() => {
        if (isOpen) {
            fetchRecipientDetails()
        } else {
            // Reset state on close
            setInvoice(null)
            setPaymentPending(false)
            setPaymentComplete(false)
            setErrorMessage(null)

            // Clean up any active subscription
            if (zapSubscription) {
                zapSubscription.stop()
                setZapSubscription(null)
            }
        }

        return () => {
            // Cleanup subscription on unmount
            if (zapSubscription) {
                zapSubscription.stop()
            }
        }
    }, [isOpen, event])

    // Fetch recipient details to prepare for zapping
    const fetchRecipientDetails = React.useCallback(async () => {
        if (!event?.pubkey) return

        try {
            setLoading(true)
            setErrorMessage(null)
            console.log('Fetching author details for pubkey:', event.pubkey)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Get user object for the event author
            const user = ndk.getUser({ pubkey: event.pubkey })
            setRecipientUser(user)

            // Check if recipient can receive zaps
            try {
                const zapInfo = await user.getZapInfo()
                console.log('Zap info:', zapInfo)

                if (zapInfo.size > 0) {
                    setZapperReady(true)

                    // Get Lightning address if available
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

    // Subscribe to zap receipts for our current event
    const subscribeToZapReceipts = () => {
        const ndk = ndkActions.getNDK()
        if (!ndk || !event.id) return null

        // Set a timestamp to track new zap receipts
        const startTime = Math.floor(Date.now() / 1000)
        setPaidAt(startTime)

        // Create a subscription for zap receipts that reference this event
        const filter = {
            kinds: [9735],
            '#e': [event.id],
            since: startTime - 5, // Allow a small buffer for time synchronization
        }

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        })

        console.log('Subscribed to zap receipts for event:', event.id)

        // Listen for incoming zap receipt events
        sub.on('event', (zapEvent: NDKEvent) => {
            console.log('Zap receipt received:', zapEvent)

            // Check if this is likely our zap
            const isRecentZap = zapEvent.created_at && zapEvent.created_at >= startTime - 10

            if (isRecentZap) {
                // We found a zap receipt for our payment
                setPaymentComplete(true)
                setPaymentPending(false)

                // Resolve the payment promise if it exists
                if (window._zapResolver) {
                    const confirmation: NDKPaymentConfirmationLN = {
                        preimage: zapEvent.tags.find((t) => t[0] === 'preimage')?.[1] || 'unknown',
                    }
                    window._zapResolver.resolve(confirmation)
                    delete window._zapResolver
                }

                // Call the completion callback
                onZapComplete?.(zapEvent)

                // Show success toast and close the dialog
                toast.success('Zap successful! 🤙')

                // Close dialog after a brief delay to show success state
                setTimeout(() => {
                    onOpenChange(false)
                    sub.stop()
                }, 1500)
            }
        })

        return sub
    }

    // Generate an invoice for the zap
    const generateInvoice = async () => {
        try {
            setLoading(true)
            setInvoice(null)
            setErrorMessage(null)
            setPaymentPending(false)
            setPaymentComplete(false)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            console.log('Creating zapper for event:', event)

            // Start subscription to listen for zap receipts
            const sub = subscribeToZapReceipts()
            setZapSubscription(sub)

            // This function will be called by NDKZapper when a bolt11 invoice is generated
            const lnPay = async (payment: NDKZapDetails<LnPaymentInfo>) => {
                console.log('Invoice generated:', payment.pr)

                // Display the invoice
                setInvoice(payment.pr)
                setLoading(false)
                setPaymentPending(true)

                // Return a promise that will be resolved when payment is confirmed
                return new Promise<NDKPaymentConfirmationLN>((resolve) => {
                    // We're not resolving this promise here
                    // It will be resolved when we receive a zap receipt event

                    // Store resolver for use when zap receipt is detected
                    window._zapResolver = {
                        resolve,
                        event,
                        amount,
                    }
                })
            }

            // Create a zapper with the manual lnPay function
            const zapper = new NDKZapper(event, amount * 1000, 'msats', {
                comment: 'Zap from WaveFunc',
                lnPay,
            })

            // Start the zap process - this should trigger lnPay with the invoice
            await zapper.zap()
            console.log('Zap process initiated successfully')
        } catch (error) {
            console.error('Failed to generate invoice:', error)
            setErrorMessage('Failed to generate invoice: ' + (error instanceof Error ? error.message : 'Unknown error'))
            setLoading(false)
            setInvoice(null)

            // Clean up the subscription if we failed
            if (zapSubscription) {
                zapSubscription.stop()
                setZapSubscription(null)
            }
        }
    }

    // Handle when the user clicks "I've Paid"
    const handlePaymentComplete = () => {
        if (!window._zapResolver) return

        setPaymentComplete(true)
        setPaymentPending(false)

        toast.success('Payment marked as complete! Waiting for confirmation...')

        // We don't manually resolve here since we want to wait for the actual zap receipt
        // The event subscription will handle resolving when the receipt comes in

        // If we don't get a zap receipt within 10 seconds, assume it worked anyway
        // (in case the relay is having issues or the receipt was sent to another relay)
        setTimeout(() => {
            if (window._zapResolver) {
                const confirmation: NDKPaymentConfirmationLN = {
                    preimage: 'manual-confirm-' + Math.random().toString(36).substring(2, 8),
                }
                window._zapResolver.resolve(confirmation)
                delete window._zapResolver

                // Call the completion callback with no event since we didn't receive one
                onZapComplete?.()
                onOpenChange(false)

                if (zapSubscription) {
                    zapSubscription.stop()
                    setZapSubscription(null)
                }
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

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Send a Zap</DialogTitle>
                    <DialogDescription>Send Lightning payment to support the creator</DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="mt-2 text-sm text-muted-foreground">Loading payment information...</p>
                    </div>
                ) : errorMessage ? (
                    <div className="py-6">
                        <p className="text-red-500">{errorMessage}</p>
                        <p className="text-sm text-muted-foreground mt-2">
                            The creator needs to set up a Lightning address in their profile to receive zaps.
                        </p>
                    </div>
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
                                    {!invoice ? (
                                        <Button
                                            onClick={generateInvoice}
                                            className="w-full"
                                            disabled={loading || !zapperReady}
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Generating invoice...
                                                </>
                                            ) : (
                                                'Generate Invoice'
                                            )}
                                        </Button>
                                    ) : (
                                        <div className="flex flex-col items-center space-y-4">
                                            <div className="bg-white p-6 rounded-lg">
                                                <QRCodeSVG
                                                    value={invoice || ''}
                                                    size={240}
                                                    level="H"
                                                    includeMargin={true}
                                                    className="mx-auto"
                                                />
                                            </div>
                                            <div className="flex flex-col w-full space-y-2">
                                                <p className="text-center text-sm mb-2">
                                                    Scan with your Lightning wallet
                                                </p>
                                                <div className="flex items-center">
                                                    <Input
                                                        value={invoice || ''}
                                                        readOnly
                                                        className="font-mono text-xs"
                                                    />
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
                                                    <p className="text-sm text-center text-muted-foreground mt-1">
                                                        Zap to: {lightningAddress}
                                                    </p>
                                                )}
                                                {paymentPending && !paymentComplete && (
                                                    <p className="text-sm text-center text-amber-500 mt-2 animate-pulse">
                                                        Waiting for payment...
                                                    </p>
                                                )}
                                                {paymentComplete && (
                                                    <p className="text-sm text-center text-green-500 mt-2">
                                                        Payment detected! Processing zap...
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="nwc" className="py-4">
                                    <div className="text-center py-8">
                                        <p className="text-muted-foreground">
                                            Nostr Wallet Connect support coming soon.
                                        </p>
                                    </div>
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

// Add types to window
declare global {
    interface Window {
        _zapResolver?: {
            resolve: (value: NDKPaymentConfirmationLN) => void
            event: NDKEvent
            amount: number
        }
    }
}
