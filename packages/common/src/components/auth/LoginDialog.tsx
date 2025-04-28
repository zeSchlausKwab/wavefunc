import { Button } from '@wavefunc/ui/components/ui/button'
import { Checkbox } from '@wavefunc/ui/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@wavefunc/ui/components/ui/dialog'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wavefunc/ui/components/ui/tabs'
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import {
    authActions,
    authStore,
    NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY,
    NOSTR_STORED_PUBKEY,
    uiActions,
    uiStore,
} from '@wavefunc/common'
import { generateSecretKey, nip19 } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BunkerConnect } from './BunkerConnect'
import { NostrConnectQR } from './NostrConnectQR'

export function LoginDialog() {
    const authState = useStore(authStore)
    const uiState = useStore(uiStore)

    const [privateKey, setPrivateKey] = useState('')
    const [encryptionPassword, setEncryptionPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [hasPromptedForLogin, setHasPromptedForLogin] = useState(false)
    const [activeTab, setActiveTab] = useState('private-key')
    const [privateKeyValidated, setPrivateKeyValidated] = useState(false)
    const [validatedUser, setValidatedUser] = useState<string | null>(null)
    const [autoLogin, setAutoLogin] = useState(true)
    const [storedPubkey, setStoredPubkey] = useState<string | null>(null)

    const isLoading = authState.isAuthenticating

    // Check if we have a stored key
    const hasStoredKey = Boolean(localStorage.getItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY))

    // Get stored pubkey if available
    useEffect(() => {
        if (hasStoredKey) {
            const pubkey = localStorage.getItem(NOSTR_STORED_PUBKEY)
            setStoredPubkey(pubkey)
        }
    }, [hasStoredKey])

    // Reset form state when component mounts or inputs need cleaning
    const resetFormInputs = () => {
        setPrivateKey('')
        setEncryptionPassword('')
        setConfirmPassword('')
        setPasswordError('')
        setPrivateKeyValidated(false)
        setValidatedUser(null)
        setAutoLogin(true)
    }

    useEffect(() => {
        if (isLoading) {
            resetAuthState()
        }
    }, [isLoading])

    useEffect(() => {
        const hasEncryptedKey = Boolean(localStorage.getItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY))
        const shouldPromptForLogin = hasEncryptedKey && !authState.isAuthenticated && !hasPromptedForLogin

        if (shouldPromptForLogin) {
            setHasPromptedForLogin(true)
            resetAuthState()
            uiActions.openAuthDialog()
        }
    }, [authState.isAuthenticated, hasPromptedForLogin])

    useEffect(() => {
        if (authState.isAuthenticated) {
            setHasPromptedForLogin(true)
            resetFormInputs()
        }
    }, [authState.isAuthenticated])

    // Reset inputs when dialog opens or closes
    useEffect(() => {
        if (!uiState.authDialog.isOpen) {
            resetFormInputs()
        }
    }, [uiState.authDialog.isOpen])

    // useEffect(() => {
    //     if (authState.needsDecryptionPassword && !uiState.authDialog.isOpen) {
    //         uiActions.openAuthDialog()
    //     }
    // }, [authState.needsDecryptionPassword, uiState.authDialog.isOpen])

    const resetAuthState = () => {}

    const handleDialogChange = (open: boolean) => {
        if (open) {
            uiActions.openAuthDialog()
        } else {
            uiActions.closeAuthDialog()
            if (isLoading) resetAuthState()
            resetFormInputs()
        }
    }

    const handleTabChange = (value: string) => {
        setActiveTab(value)
        resetFormInputs()
    }

    const handleValidatePrivateKey = async () => {
        setPasswordError('')
        try {
            // Don't actually log out - just create a temporary validation
            // Set authenticating state while validating
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))

            // Create a temporary signer to validate the key without logging in fully
            const tempSigner = new NDKPrivateKeySigner(privateKey)
            await tempSigner.blockUntilReady()

            // Get the user's pubkey to show
            const user = await tempSigner.user()
            setValidatedUser(user.pubkey)

            // Mark key as validated but don't actually log in
            setPrivateKeyValidated(true)

            // Reset authentication state
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        } catch (error) {
            console.error('Private key validation failed:', error)
            setPasswordError(error instanceof Error ? error.message : 'Invalid private key')
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    }

    const handleLoginWithPassword = async (password: string): Promise<void> => {
        setPasswordError('')

        try {
            if (hasStoredKey) {
                await authActions.decryptAndLogin(password)
                resetFormInputs()
                uiActions.closeAuthDialog()
            }
        } catch (error) {
            if (hasStoredKey) {
                setPasswordError('Incorrect password')
            } else {
                setPasswordError(error instanceof Error ? error.message : 'Authentication failed')
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

        try {
            // Use the auth store to encrypt and store the private key
            await authActions.encryptAndStorePrivateKey(privateKey, encryptionPassword, autoLogin)

            // Log in with the validated private key
            await authActions.loginWithPrivateKey(privateKey)

            resetFormInputs()
            uiActions.closeAuthDialog()
        } catch (error) {
            setPasswordError(error instanceof Error ? error.message : 'Authentication failed')
        }
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
        setPasswordError(errorMessage)
    }

    const handleExtensionLogin = async () => {
        try {
            await authActions.loginWithExtension()
            uiActions.closeAuthDialog()
        } catch (error) {
            console.error('Extension login failed:', error)
            handleError(error instanceof Error ? error : String(error))
        }
    }

    const clearStoredKeys = () => {
        authActions.logout()
        resetFormInputs()
        uiActions.closeAuthDialog()
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

                    <Button onClick={clearStoredKeys} variant="outline" className="w-full">
                        Remove Stored Key & Continue Anonymously
                    </Button>
                </div>
            )
        }

        if (privateKeyValidated) {
            return (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="encryption-password">Set Encryption Password</Label>
                        <p className="text-sm text-muted-foreground">
                            Your private key will be encrypted and stored in your browser.
                        </p>
                        {validatedUser && (
                            <p className="text-sm font-medium">
                                Pubkey:{' '}
                                {validatedUser
                                    ? `${validatedUser.slice(0, 8)}...${validatedUser.slice(-4)}`
                                    : 'Unknown'}
                            </p>
                        )}
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

                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="auto-login"
                            checked={autoLogin}
                            onCheckedChange={(checked: boolean | 'indeterminate') => setAutoLogin(checked === true)}
                        />
                        <Label htmlFor="auto-login" className="text-sm text-muted-foreground cursor-pointer">
                            Automatically login next time
                        </Label>
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
                    {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
                </div>
                <Button onClick={handleValidatePrivateKey} disabled={isLoading || !privateKey} className="w-full">
                    {isLoading ? 'Validating...' : 'Continue'}
                </Button>
            </div>
        )
    }

    return (
        <Dialog open={uiState.authDialog.isOpen} onOpenChange={handleDialogChange}>
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
                                <NostrConnectQR onError={handleError} onSuccess={() => uiActions.closeAuthDialog()} />
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
                            <Button onClick={handleExtensionLogin} disabled={isLoading} className="w-full">
                                {isLoading ? 'Connecting...' : 'Connect to Extension'}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
                {passwordError && <div className="text-sm text-red-500 mt-2 text-center">{passwordError}</div>}
            </DialogContent>
        </Dialog>
    )
}
