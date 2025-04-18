import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ndkActions } from '@wavefunc/common'
import { walletActions, walletStore } from '@wavefunc/common'
import { useStore } from '@tanstack/react-store'
import { AlertTriangle, CheckCircle2, Wallet, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

export function NWCWalletSettings() {
    const [pairingCode, setPairingCode] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [testInvoice, setTestInvoice] = useState('')
    const [paymentStatus, setPaymentStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
    const [paymentError, setPaymentError] = useState<string | null>(null)
    const [walletInfo, setWalletInfo] = useState<any>(null)

    const walletState = useStore(walletStore)

    useEffect(() => {
        // If we already have a wallet connection, populate the fields
        if (walletState.walletData?.type === 'nwc') {
            setPairingCode(walletState.walletData.pairingCode)
        }

        // If we have a wallet, get wallet info
        if (walletState.wallet) {
            fetchWalletInfo()
        }
    }, [walletState.wallet])

    const fetchWalletInfo = async () => {
        if (!walletState.wallet) return

        try {
            // Check if it's an NWC wallet and has getInfo method
            if (walletState.walletData?.type === 'nwc' && typeof (walletState.wallet as any).getInfo === 'function') {
                const info = await (walletState.wallet as any).getInfo()
                setWalletInfo(info)
            } else {
                setWalletInfo({
                    balance: walletState.balance,
                    alias: 'Wallet',
                })
            }
        } catch (e) {
            console.error('Failed to get wallet info', e)
        }
    }

    const connectWallet = async () => {
        const ndk = ndkActions.getNDK()
        if (!ndk || !pairingCode) return

        setIsConnecting(true)
        setError(null)

        try {
            // Connect NWC wallet
            const wallet = await walletActions.connectNWC(ndk, pairingCode)

            if (!wallet) {
                throw new Error('Failed to initialize wallet')
            }

            await fetchWalletInfo()
        } catch (e) {
            console.error('Failed to connect wallet', e)
            setError(e instanceof Error ? e.message : 'Failed to connect to wallet')
        } finally {
            setIsConnecting(false)
        }
    }

    const disconnectWallet = () => {
        walletActions.disconnect()
        setWalletInfo(null)
    }

    const sendTestPayment = async () => {
        if (!walletState.wallet || !testInvoice) return

        setPaymentStatus('sending')
        setPaymentError(null)

        try {
            if (walletState.walletData?.type === 'nwc' && typeof (walletState.wallet as any).lnPay === 'function') {
                // Use lnPay for NWC wallets
                await (walletState.wallet as any).lnPay({ pr: testInvoice })
                setPaymentStatus('success')
                setTestInvoice('')
                // Update balance after payment
                walletActions.updateBalance()
            } else {
                throw new Error('Wallet does not support payments')
            }
        } catch (e) {
            console.error('Payment failed', e)
            setPaymentStatus('error')
            setPaymentError(e instanceof Error ? e.message : 'Payment failed')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Nostr Wallet Connect</h2>
            </div>

            <p className="text-muted-foreground mb-6">
                Connect to a NIP-47 compatible Lightning wallet using Nostr Wallet Connect (NWC). This allows you to
                send zaps and make payments without giving this application direct access to your funds.
            </p>

            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!walletState.isConnected || walletState.walletData?.type !== 'nwc' ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Connect Wallet</CardTitle>
                        <CardDescription>Enter your NWC pairing code to connect your wallet</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="pairingCode">NWC Pairing Code</Label>
                                <Input
                                    id="pairingCode"
                                    placeholder="nostr+walletconnect://..."
                                    value={pairingCode}
                                    onChange={(e) => setPairingCode(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Get this pairing code from your NWC-compatible wallet, such as Alby or Umbrel.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={connectWallet} disabled={isConnecting || !pairingCode}>
                            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                        </Button>
                    </CardFooter>
                </Card>
            ) : (
                <>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                Wallet Connected
                            </CardTitle>
                            <CardDescription>Your wallet is connected and ready to use</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {walletInfo && (
                                <div className="space-y-2 text-sm">
                                    {walletInfo.alias && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Wallet Name:</span>
                                            <span>{walletInfo.alias}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Balance:</span>
                                        <span>
                                            {walletState.balance !== undefined
                                                ? `${walletState.balance} sats`
                                                : 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button variant="outline" onClick={disconnectWallet}>
                                Disconnect Wallet
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Test Your Connection</CardTitle>
                            <CardDescription>
                                Send a test payment to verify your wallet is working correctly
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="testInvoice">Lightning Invoice</Label>
                                    <Input
                                        id="testInvoice"
                                        placeholder="lnbc..."
                                        value={testInvoice}
                                        onChange={(e) => setTestInvoice(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Enter a small value Lightning invoice to test your wallet connection.
                                    </p>
                                </div>

                                {paymentStatus === 'success' && (
                                    <Alert className="bg-green-50 border-green-200">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        <AlertTitle>Payment Successful</AlertTitle>
                                        <AlertDescription>Your test payment was sent successfully!</AlertDescription>
                                    </Alert>
                                )}

                                {paymentStatus === 'error' && paymentError && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Payment Failed</AlertTitle>
                                        <AlertDescription>{paymentError}</AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                onClick={sendTestPayment}
                                disabled={paymentStatus === 'sending' || !testInvoice || !walletState.isConnected}
                                className="flex items-center gap-2"
                            >
                                {paymentStatus === 'sending' ? 'Sending...' : 'Send Test Payment'}
                                <Zap className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                </>
            )}
        </div>
    )
}
