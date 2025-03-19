import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { auth, authStore } from '@/lib/store/auth'
import { useStore } from '@tanstack/react-store'
import { generateSecretKey, nip19 } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BunkerConnect } from './BunkerConnect'
import { NostrConnectQR } from './NostrConnectQR'

export function LoginDialog() {
    const authState = useStore(authStore)
    const [privateKey, setPrivateKey] = useState('')
    const [encryptionPassword, setEncryptionPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [hasPromptedForLogin, setHasPromptedForLogin] = useState(false)
    const [activeTab, setActiveTab] = useState('private-key')

    const isLoading = authState.status === 'loading'
    const hasStoredKey = auth.hasEncryptedKey()
    const storedPubkey = auth.getStoredPubkey()

    // Reset form state when component mounts or inputs need cleaning
    const resetFormInputs = () => {
        setPrivateKey('')
        setEncryptionPassword('')
        setConfirmPassword('')
        setPasswordError('')
    }

    useEffect(() => {
        if (isLoading) {
            resetAuthState()
        }
    }, [isLoading])

    useEffect(() => {
        const shouldPromptForLogin =
            hasStoredKey && !authState.isLoginDialogOpen && authState.status !== 'authenticated' && !hasPromptedForLogin

        if (shouldPromptForLogin) {
            setHasPromptedForLogin(true)
            resetAuthState()
            auth.openLoginDialog()
        }
    }, [authState.isLoginDialogOpen, authState.status, hasPromptedForLogin, hasStoredKey])

    useEffect(() => {
        if (authState.status === 'authenticated') {
            setHasPromptedForLogin(true)
            resetFormInputs()
        }
    }, [authState.status])

    // Reset inputs when dialog opens or closes
    useEffect(() => {
        if (!authState.isLoginDialogOpen) {
            resetFormInputs()
        }
    }, [authState.isLoginDialogOpen])

    const resetAuthState = () => {
        auth.store.setState((state) => ({
            ...state,
            status: 'anonymous',
            error: null,
        }))
    }

    const handleDialogChange = (open: boolean) => {
        if (open) {
            auth.openLoginDialog()
        } else {
            auth.closeLoginDialog()
            if (isLoading) resetAuthState()
            resetFormInputs()
        }
    }

    const handleTabChange = (value: string) => {
        setActiveTab(value)
        resetFormInputs()
    }

    const handleValidatePrivateKey = async () => {
        try {
            await auth.validatePrivateKey(privateKey)
            setPrivateKey('') // Clear private key after validation
        } catch (error) {
            console.error('Private key validation failed:', error)
        }
    }

    const handleLoginWithPassword = async (password: string): Promise<void> => {
        setPasswordError('')

        try {
            if (hasStoredKey) {
                await auth.loginWithEncryptedKey(password)
                resetFormInputs()
            } else {
                await auth.encryptAndLoginWithPrivateKey(password)
                resetFormInputs()
            }
        } catch (error) {
            if (hasStoredKey) {
                setPasswordError('Incorrect password')
            } else {
                setPasswordError(error instanceof Error ? error.message : 'Encryption failed')
            }
        }
    }

    const handleEncryptAndLogin = async () => {
        if (encryptionPassword !== confirmPassword) {
            setPasswordError('Passwords do not match')
            return
        }

        if (encryptionPassword === '') {
            setPasswordError('Password cannot be empty')
            return
        }

        await handleLoginWithPassword(encryptionPassword)
    }

    const handleStoredKeyLogin = async () => {
        if (!encryptionPassword) {
            setPasswordError('Please enter your password')
            return
        }

        await handleLoginWithPassword(encryptionPassword)
    }

    const handleError = (error: string | Error) => {
        const errorMessage = error instanceof Error ? error.message : error
        console.error(errorMessage)
        auth.store.setState((state) => ({
            ...state,
            error: new Error(errorMessage),
        }))
    }

    const renderPrivateKeySection = () => {
        if (hasStoredKey) {
            return (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="stored-password">Enter Password</Label>
                        <p className="text-sm text-muted-foreground">
                            Enter your password to decrypt your stored private key.
                        </p>
                        <p className="text-sm font-medium">
                            Pubkey: {storedPubkey ? `${storedPubkey.slice(0, 8)}...` : 'Unknown'}
                        </p>
                        <Input
                            id="stored-password"
                            type="password"
                            placeholder="Password"
                            value={encryptionPassword}
                            onChange={(e) => setEncryptionPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && encryptionPassword) {
                                    handleStoredKeyLogin()
                                }
                            }}
                        />
                        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
                    </div>
                    <Button onClick={handleStoredKeyLogin} disabled={isLoading} className="w-full">
                        {isLoading ? 'Decrypting...' : 'Login'}
                    </Button>

                    <div className="flex items-center my-4">
                        <div className="flex-grow h-px bg-muted"></div>
                        <span className="px-2 text-xs text-muted-foreground">OR</span>
                        <div className="flex-grow h-px bg-muted"></div>
                    </div>

                    <Button
                        onClick={() => {
                            auth.clearStoredKeys()
                            resetFormInputs()
                        }}
                        variant="outline"
                        className="w-full"
                    >
                        Remove Stored Key & Continue Anonymously
                    </Button>
                </div>
            )
        }

        if (authState.privateKeyValidated) {
            return (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="encryption-password">Set Encryption Password</Label>
                        <p className="text-sm text-muted-foreground">
                            Your private key will be encrypted and stored in your browser.
                        </p>
                        <Input
                            id="encryption-password"
                            type="password"
                            placeholder="Password"
                            value={encryptionPassword}
                            onChange={(e) => setEncryptionPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && encryptionPassword && confirmPassword) {
                                    handleEncryptAndLogin()
                                }
                            }}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm Password</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            placeholder="Confirm password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && encryptionPassword && confirmPassword) {
                                    handleEncryptAndLogin()
                                }
                            }}
                        />
                        {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
                    </div>
                    <Button
                        onClick={handleEncryptAndLogin}
                        disabled={isLoading || encryptionPassword === '' || confirmPassword === ''}
                        className="w-full"
                    >
                        {isLoading ? 'Encrypting...' : 'Encrypt and Login'}
                    </Button>
                </div>
            )
        }

        return (
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="private-key">Private Key (nsec)</Label>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const newPrivateKey = generateSecretKey()
                                setPrivateKey(nip19.nsecEncode(newPrivateKey))
                            }}
                        >
                            Generate New Key
                        </Button>
                    </div>
                    <Input
                        id="private-key"
                        type="password"
                        placeholder="nsec1..."
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && privateKey) {
                                handleValidatePrivateKey()
                            }
                        }}
                    />
                </div>
                <Button onClick={handleValidatePrivateKey} disabled={isLoading || !privateKey} className="w-full">
                    {isLoading ? 'Validating...' : 'Continue'}
                </Button>
            </div>
        )
    }

    return (
        <Dialog open={authState.isLoginDialogOpen} onOpenChange={handleDialogChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Login to WaveFunc</DialogTitle>
                    <DialogDescription>Choose your preferred login method below.</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="private-key" className="w-full" value={activeTab} onValueChange={handleTabChange}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="private-key">Private Key</TabsTrigger>
                        <TabsTrigger value="connect">Nostr Connect</TabsTrigger>
                        <TabsTrigger value="extension">Extension</TabsTrigger>
                    </TabsList>
                    <TabsContent value="private-key">{renderPrivateKeySection()}</TabsContent>
                    <TabsContent value="connect">
                        <Tabs defaultValue="qr" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="qr">QR Code</TabsTrigger>
                                <TabsTrigger value="bunker">Bunker</TabsTrigger>
                            </TabsList>

                            <TabsContent value="qr">
                                <NostrConnectQR onError={handleError} />
                            </TabsContent>

                            <TabsContent value="bunker">
                                <BunkerConnect onError={handleError} />
                            </TabsContent>
                        </Tabs>
                    </TabsContent>
                    <TabsContent value="extension">
                        <div className="space-y-4 py-4">
                            <p className="text-sm text-muted-foreground">
                                Login using your Nostr browser extension (e.g., Alby, nos2x).
                            </p>
                            <Button
                                onClick={() => auth.loginWithExtension().catch(console.error)}
                                disabled={isLoading}
                                className="w-full"
                            >
                                {isLoading ? 'Connecting...' : 'Connect to Extension'}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
                {authState.error?.message && !passwordError && (
                    <div className="text-sm text-red-500 mt-2 text-center">{authState.error.message}</div>
                )}
            </DialogContent>
        </Dialog>
    )
}
