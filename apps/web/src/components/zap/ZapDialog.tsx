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

    useEffect(() => {
        if (isOpen) {
            fetchRecipientDetails()
        } else {
            setInvoice(null)
            setPaymentPending(false)
            setPaymentComplete(false)
            setErrorMessage(null)

            if (zapSubscription) {
                zapSubscription.stop()
                setZapSubscription(null)
            }
        }

        return () => {
            if (zapSubscription) {
                zapSubscription.stop()
            }
        }
    }, [isOpen, event])

    const fetchRecipientDetails = React.useCallback(async () => {
        if (!event?.pubkey) return

        try {
            setLoading(true)
            setErrorMessage(null)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const user = ndk.getUser({ pubkey: event.pubkey })
            setRecipientUser(user)

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

    const subscribeToZapReceipts = () => {
        const ndk = ndkActions.getNDK()
        if (!ndk || !event.id) return null

        const startTime = Math.floor(Date.now() / 1000)
        setPaidAt(startTime)

        const filter = {
            kinds: [9735],
            '#e': [event.id],
            since: startTime - 5,
        }

        const sub = ndk.subscribe(filter, {
            closeOnEose: false,
            cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
        })

        sub.on('event', (zapEvent: NDKEvent) => {
            const descriptionTag = zapEvent.tags.find((t) => t[0] === 'description')?.[1]
            let isOurZap = false

            if (descriptionTag) {
                try {
                    const zapRequest = JSON.parse(descriptionTag)
                    isOurZap = zapRequest.tags?.some(
                        (tag: string[]) =>
                            (tag[0] === 'e' && tag[1] === event.id) || (tag[0] === 'a' && tag[1]?.includes(event.id)),
                    )
                } catch (error) {
                    console.error('Failed to parse zap request:', error)
                }
            }

            const isRecentZap = zapEvent.created_at && zapEvent.created_at >= startTime - 10

            if (isOurZap || isRecentZap) {
                setPaymentComplete(true)
                setPaymentPending(false)

                if (window._zapResolver) {
                    const confirmation: NDKPaymentConfirmationLN = {
                        preimage: zapEvent.tags.find((t) => t[0] === 'preimage')?.[1] || 'unknown',
                    }
                    window._zapResolver.resolve(confirmation)
                    delete window._zapResolver
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
    }

    const generateInvoice = async () => {
        try {
            setLoading(true)
            setInvoice(null)
            setErrorMessage(null)
            setPaymentPending(false)
            setPaymentComplete(false)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const sub = subscribeToZapReceipts()
            setZapSubscription(sub)

            const lnPay = async (payment: NDKZapDetails<LnPaymentInfo>) => {
                setInvoice(payment.pr)
                setLoading(false)
                setPaymentPending(true)

                return new Promise<NDKPaymentConfirmationLN>((resolve) => {
                    window._zapResolver = {
                        resolve,
                        event,
                        amount,
                    }
                })
            }

            const zapper = new NDKZapper(event, amount * 1000, 'msats', {
                comment: 'Zap from WaveFunc',
                lnPay,
            })

            await zapper.zap()
        } catch (error) {
            console.error('Failed to generate invoice:', error)
            setErrorMessage('Failed to generate invoice: ' + (error instanceof Error ? error.message : 'Unknown error'))
            setLoading(false)
            setInvoice(null)

            if (zapSubscription) {
                zapSubscription.stop()
                setZapSubscription(null)
            }
        }
    }

    const handlePaymentComplete = () => {
        if (!window._zapResolver) return

        setPaymentComplete(true)
        setPaymentPending(false)

        toast.success('Payment marked as complete! Waiting for confirmation...')

        setTimeout(() => {
            if (window._zapResolver) {
                const confirmation: NDKPaymentConfirmationLN = {
                    preimage: 'manual-confirm-' + Math.random().toString(36).substring(2, 8),
                }
                window._zapResolver.resolve(confirmation)
                delete window._zapResolver

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
