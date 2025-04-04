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
import type { NDKPaymentConfirmation, NDKZapSplit } from '@nostr-dev-kit/ndk'
import {
    NDKEvent,
    NDKZapper,
    type LnPaymentInfo,
    type NDKPaymentConfirmationLN,
    type NDKUser,
    type NDKZapDetails,
    type NDKZapMethod,
    type NDKZapMethodInfo,
} from '@nostr-dev-kit/ndk'
import { Copy, Loader2, Wallet, Zap } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface ZapDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    event: NDKEvent
    onZapComplete?: () => void
}

export function ZapDialog({ isOpen, onOpenChange, event, onZapComplete }: ZapDialogProps) {
    const [amount, setAmount] = useState<number>(7)
    const [loading, setLoading] = useState<boolean>(false)
    const [invoice, setInvoice] = useState<string | null>(null)
    const [recipient, setRecipient] = useState<string | null>(null)
    const [recipientUser, setRecipientUser] = useState<NDKUser | null>(null)
    const [lightningAddress, setLightningAddress] = useState<string | null>(null)
    const [zapperReady, setZapperReady] = useState<boolean>(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const [zapRequest, setZapRequest] = useState<Map<NDKZapMethod, NDKZapMethodInfo> | null>(null)

    useEffect(() => {
        const fetchEventAuthorDetails = async () => {
            if (!event || !event.pubkey) return

            try {
                setLoading(true)
                setErrorMessage(null)
                console.log('Fetching author details for pubkey:', event.pubkey)

                const ndk = ndkActions.getNDK()
                if (!ndk) throw new Error('NDK not available')

                // We're simplifying this for now - just enable zapping without checking capabilities
                setZapperReady(true)
                setRecipient(event.pubkey)

                // Get user object for the event author
                const user = ndk.getUser({ pubkey: event.pubkey })
                setRecipientUser(user)

                // Optional: Try to get Lightning address if available
                try {
                    const zapInfo = await user.getZapInfo()
                    console.log('Zap info:', zapInfo)

                    if (zapInfo.size > 0) {
                        // Check for Lightning address in zap info
                        const nip57Info = zapInfo.get('nip57')
                        const nip61Info = zapInfo.get('nip61')

                        if (nip57Info && 'lud16' in nip57Info && nip57Info.lud16) {
                            setLightningAddress(nip57Info.lud16)
                        } else if (nip61Info && 'lud16' in nip61Info && nip61Info.lud16) {
                            setLightningAddress(nip61Info.lud16)
                        }
                    }
                } catch (err) {
                    console.warn('Could not fetch zap info:', err)
                    // Continue anyway - we'll still try to zap
                }
            } catch (error) {
                console.error('Failed to fetch user details:', error)
                setErrorMessage('Failed to fetch user payment information')
                setZapperReady(false)
            } finally {
                setLoading(false)
            }
        }

        if (isOpen) {
            fetchEventAuthorDetails()
        } else {
            // Reset state when closing
            setInvoice(null)
            setErrorMessage(null)
        }
    }, [isOpen, event])

    const generateInvoice = async () => {
        try {
            setLoading(true)
            setInvoice(null)
            setErrorMessage(null)

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Explicitly set wallet to undefined to use manual flow
            ndk.wallet = undefined

            console.log('Creating zapper for event:', event)

            // This function will be called when a bolt11 invoice needs to be paid
            const lnPay = async (payment: NDKZapDetails<LnPaymentInfo>) => {
                console.log('Invoice generated:', payment.pr)

                // Set the invoice to display to the user
                setInvoice(payment.pr)
                setLoading(false)

                // We don't need to actually resolve this promise for the QR code to display
                // It would only be relevant in a real implementation tracking payment
                return new Promise<NDKPaymentConfirmationLN>(() => {
                    // This promise intentionally never resolves because we're not tracking
                    // real payments in this simplified implementation
                })
            }

            try {
                // Create a zapper with the manual lnPay function
                const zapper = new NDKZapper(event, amount * 1000, 'msats', {
                    comment: 'Zap from WaveFunc',
                    lnPay,
                })

                // Log for debugging
                console.log('Zapper created, initiating zap process')

                // Start the zap process - this should trigger lnPay with the invoice
                await zapper.zap()

                // If we reach this point, lnPay should have been called and state updated
                console.log('Zap process initiated successfully')
            } catch (err) {
                console.error('Zapper error:', err)
                throw err // Re-throw to be caught by outer try/catch
            }
        } catch (error) {
            console.error('Failed to generate invoice:', error)
            setErrorMessage('Failed to generate invoice: ' + (error instanceof Error ? error.message : 'Unknown error'))
            setLoading(false)
            setInvoice(null)
        }
    }

    // Simplified payment completion handler
    const handlePaymentComplete = () => {
        toast.success('Thank you for your zap! 🤙')
        onZapComplete?.()
        onOpenChange(false)
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
                    <DialogDescription>
                        Send a Lightning payment to support the creator {JSON.stringify(zapRequest)}
                    </DialogDescription>
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
                                        <Button onClick={generateInvoice} className="w-full" disabled={loading}>
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
                    {invoice && (
                        <Button type="button" onClick={handlePaymentComplete}>
                            I've Paid
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
