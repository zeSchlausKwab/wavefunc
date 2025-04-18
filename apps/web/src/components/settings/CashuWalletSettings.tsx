import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Wallet, AlertTriangle, CheckCircle2, Plus, X } from 'lucide-react'
import { walletStore, walletActions } from '@wavefunc/common'
import { useStore } from '@tanstack/react-store'
import { ndkActions } from '@wavefunc/common'

export function CashuWalletSettings() {
    const [mints, setMints] = useState<string[]>([])
    const [currentMint, setCurrentMint] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const walletState = useStore(walletStore)

    const addMint = () => {
        if (currentMint && !mints.includes(currentMint)) {
            setMints([...mints, currentMint])
            setCurrentMint('')
        }
    }

    const removeMint = (mintToRemove: string) => {
        setMints(mints.filter((mint) => mint !== mintToRemove))
    }

    const connectWallet = async () => {
        const ndk = ndkActions.getNDK()
        if (!ndk || mints.length === 0) return

        setIsConnecting(true)
        setError(null)

        try {
            // Connect Cashu wallet
            const wallet = await walletActions.connectCashu(ndk, mints)

            if (!wallet) {
                throw new Error('Failed to initialize wallet')
            }
        } catch (e) {
            console.error('Failed to connect wallet', e)
            setError(e instanceof Error ? e.message : 'Failed to connect to wallet')
        } finally {
            setIsConnecting(false)
        }
    }

    const disconnectWallet = () => {
        walletActions.disconnect()
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Cashu Wallet (NIP-60)</h2>
            </div>

            <p className="text-muted-foreground mb-6">
                Set up a Cashu eCash wallet compatible with NIP-60. This allows you to send and receive eCash tokens via
                Nutzaps.
            </p>

            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {!walletState.isConnected || walletState.walletData?.type !== 'cashu' ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Setup Cashu Wallet</CardTitle>
                        <CardDescription>Configure the mints you want to use with your wallet</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="mint">Add a Mint</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="mint"
                                        placeholder="https://mint.example.com"
                                        value={currentMint}
                                        onChange={(e) => setCurrentMint(e.target.value)}
                                    />
                                    <Button variant="outline" size="icon" onClick={addMint} disabled={!currentMint}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Add the URLs of Cashu mints you want to use
                                </p>
                            </div>

                            {mints.length > 0 && (
                                <div className="mt-4">
                                    <Label>Configured Mints</Label>
                                    <div className="mt-2 space-y-2">
                                        {mints.map((mint, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between bg-muted p-2 rounded-md"
                                            >
                                                <span className="text-sm truncate flex-1">{mint}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => removeMint(mint)}
                                                    className="h-8 w-8"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={connectWallet} disabled={isConnecting || mints.length === 0}>
                            {isConnecting ? 'Connecting...' : 'Setup Wallet'}
                        </Button>
                    </CardFooter>
                </Card>
            ) : (
                <>
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                Cashu Wallet Connected
                            </CardTitle>
                            <CardDescription>Your Cashu wallet is active and ready to use</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {walletState.walletData?.type === 'cashu' && (
                                <div className="space-y-4">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Balance:</span>
                                            <span>
                                                {walletState.balance !== undefined
                                                    ? `${walletState.balance} sats`
                                                    : 'Unknown'}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-medium mb-2">Configured Mints</h4>
                                        <div className="space-y-1">
                                            {walletState.walletData.mints.map((mint, index) => (
                                                <div
                                                    key={index}
                                                    className="text-xs text-muted-foreground bg-muted p-2 rounded-md"
                                                >
                                                    {mint}
                                                </div>
                                            ))}
                                        </div>
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
                </>
            )}
        </div>
    )
}
