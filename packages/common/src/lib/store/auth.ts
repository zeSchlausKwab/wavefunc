import { NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk'
import { Store } from '@tanstack/store'
import { ndkActions } from './ndk'
import { nip19 } from 'nostr-tools'
import { encrypt, decrypt } from 'nostr-tools/nip49'

export const NOSTR_CONNECT_KEY = 'nostr_connect_url'
export const NOSTR_LOCAL_SIGNER_KEY = 'nostr_local_signer_key'
export const NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY = 'nostr_local_encrypted_signer_key'
export const NOSTR_AUTO_LOGIN = 'nostr_auto_login'
export const NOSTR_STORED_PUBKEY = 'nostr_stored_pubkey'
export const NOSTR_CONNECTION_ATTEMPT = 'nostr_connection_attempt'
export const NOSTR_MAX_RETRIES = 2

interface AuthState {
    user: NDKUser | null
    isAuthenticated: boolean
    needsDecryptionPassword: boolean
    isAuthenticating: boolean
}

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    needsDecryptionPassword: false,
    isAuthenticating: false,
}

// Function to encrypt private key using nostr-tools/nip49
export const encryptPrivateKey = async (privateKey: string, password: string): Promise<string> => {
    try {
        // For nsec keys, decode them first
        let hexOrBytesKey: string | Uint8Array = privateKey
        if (privateKey.startsWith('nsec')) {
            const { data } = nip19.decode(privateKey)
            hexOrBytesKey = data as Uint8Array
        }

        // Encrypt the private key - returns an ncryptsec string
        const encryptedKey = await encrypt(hexOrBytesKey as any, password)
        return encryptedKey
    } catch (error) {
        console.error('Error encrypting private key:', error)
        throw new Error('Failed to encrypt private key')
    }
}

// Function to decrypt private key using nostr-tools/nip49
export const decryptPrivateKey = async (encryptedKey: string, password: string): Promise<string> => {
    try {
        // Handle legacy format (temporary)
        if (encryptedKey.startsWith('placeholder:')) {
            const [, key] = encryptedKey.split(':')
            return key
        }

        // Decrypt the ncryptsec key
        const decryptedKey = await decrypt(encryptedKey, password)

        // Convert to hex string if it's bytes
        if (decryptedKey instanceof Uint8Array) {
            // Use Array.from + map instead of Buffer for browser compatibility
            return Array.from(decryptedKey)
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
        }

        return decryptedKey as string
    } catch (error) {
        console.error('Error decrypting private key:', error)
        throw new Error('Incorrect password or invalid encrypted key')
    }
}

export const authStore = new Store<AuthState>(initialState)
export const authActions = {
    getAuthFromLocalStorageAndLogin: async () => {
        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))

            // Check if we have both a bunker URL and a local signer key in localStorage
            const bunkerUrl = localStorage.getItem(NOSTR_CONNECT_KEY)
            const privateKey = localStorage.getItem(NOSTR_LOCAL_SIGNER_KEY)

            if (bunkerUrl && privateKey) {
                console.log('Found NIP-46 credentials, attempting to reconnect...')

                // Track connection attempts for the same credentials
                const storedUrl = localStorage.getItem(NOSTR_CONNECT_KEY)
                const storedAttempts = parseInt(localStorage.getItem(NOSTR_CONNECTION_ATTEMPT) || '0')

                // If we're trying with the same credentials, increment the counter
                if (storedUrl === bunkerUrl) {
                    const attempts = storedAttempts + 1
                    localStorage.setItem(NOSTR_CONNECTION_ATTEMPT, attempts.toString())

                    // If we've tried too many times, clear the credentials
                    if (attempts > NOSTR_MAX_RETRIES) {
                        console.warn(`NIP-46 reconnection failed ${attempts} times, clearing credentials`)
                        localStorage.removeItem(NOSTR_CONNECT_KEY)
                        localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
                        localStorage.removeItem(NOSTR_CONNECTION_ATTEMPT)
                        authStore.setState((state) => ({ ...state, isAuthenticating: false }))
                        // Continue to other auth methods
                        return
                    }
                } else {
                    // New URL, reset counter
                    localStorage.setItem(NOSTR_CONNECTION_ATTEMPT, '1')
                }

                try {
                    // Initialize NDK if it's not already
                    const ndk = ndkActions.getNDK()
                    if (!ndk) {
                        console.error('NDK not initialized')
                        throw new Error('NDK not initialized')
                    }

                    // Ensure NDK is connected - check if we have active relays
                    if (ndk.pool?.relays.size === 0) {
                        await ndkActions.connect()
                    }

                    // Create local signer from the stored key
                    const localSigner = new NDKPrivateKeySigner(privateKey)
                    await localSigner.blockUntilReady()

                    // Initialize the NIP-46 signer
                    const signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)

                    // Add timeout protection for blockUntilReady
                    let signerReady = false
                    const signerReadyPromise = signer.blockUntilReady().then(() => {
                        signerReady = true
                        console.log('NIP-46 signer ready')
                        return true
                    })

                    const timeoutPromise = new Promise<boolean>((resolve) => {
                        setTimeout(() => {
                            if (!signerReady) {
                                console.error('NIP-46 signer timeout after 10 seconds')
                                resolve(false)
                            } else {
                                resolve(true)
                            }
                        }, 10000) // 10 second timeout
                    })

                    // Race between ready and timeout
                    const isReady = await Promise.race([signerReadyPromise, timeoutPromise])

                    if (!isReady) {
                        throw new Error('NIP-46 connection timeout')
                    }

                    ndkActions.setSigner(signer)

                    // Get the user and update auth state
                    const user = await signer.user()
                    authStore.setState((state) => ({
                        ...state,
                        user,
                        isAuthenticated: true,
                        isAuthenticating: false,
                    }))

                    // Reset connection attempts on success
                    localStorage.removeItem(NOSTR_CONNECTION_ATTEMPT)
                    console.log('NIP-46 reconnection successful')
                    return
                } catch (error) {
                    console.error('NIP-46 reconnection failed:', error)
                    // Clean up failed NIP-46 connection if we've reached max retries
                    if (parseInt(localStorage.getItem(NOSTR_CONNECTION_ATTEMPT) || '0') >= NOSTR_MAX_RETRIES) {
                        console.warn('Removing failed NIP-46 connection credentials after max retries')
                        localStorage.removeItem(NOSTR_CONNECT_KEY)
                        localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
                        localStorage.removeItem(NOSTR_CONNECTION_ATTEMPT)
                    }
                    authStore.setState((state) => ({ ...state, isAuthenticating: false }))
                    // Continue to other auth methods instead of throwing
                }
            }

            // Check for encrypted private key
            const encryptedPrivateKey = localStorage.getItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY)
            if (encryptedPrivateKey) {
                const autoLogin = localStorage.getItem(NOSTR_AUTO_LOGIN)
                if (autoLogin !== 'true') {
                    authStore.setState((state) => ({
                        ...state,
                        needsDecryptionPassword: true,
                        isAuthenticating: false,
                    }))
                    return
                }

                // Even with auto login, we need the password for decryption
                // But we can't auto-login without user intervention to provide the password
                authStore.setState((state) => ({
                    ...state,
                    needsDecryptionPassword: true,
                    isAuthenticating: false,
                }))
                return
            }

            // Try extension login as fallback
            try {
                await authActions.loginWithExtension()
            } catch (error) {
                console.error('Extension login fallback failed:', error)
                authStore.setState((state) => ({ ...state, isAuthenticating: false }))
            }
        } catch (error) {
            console.error('Authentication failed:', error)
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    },

    decryptAndLogin: async (password: string) => {
        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))
            const encryptedPrivateKey = localStorage.getItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY)
            if (!encryptedPrivateKey) {
                throw new Error('No encrypted key found')
            }

            // Decrypt the private key
            const privateKey = await decryptPrivateKey(encryptedPrivateKey, password)

            // Login with the decrypted key
            await authActions.loginWithPrivateKey(privateKey)

            authStore.setState((state) => ({ ...state, needsDecryptionPassword: false }))
        } catch (error) {
            throw error
        } finally {
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    },

    encryptAndStorePrivateKey: async (privateKey: string, password: string, autoLogin: boolean) => {
        try {
            // Encrypt the private key
            const encryptedKey = await encryptPrivateKey(privateKey, password)

            // Store the encrypted key
            localStorage.setItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY, encryptedKey)

            // Set auto login preference
            if (autoLogin) {
                localStorage.setItem(NOSTR_AUTO_LOGIN, 'true')
            } else {
                localStorage.removeItem(NOSTR_AUTO_LOGIN)
            }

            // Store pubkey for display purposes
            try {
                const signer = new NDKPrivateKeySigner(privateKey)
                await signer.blockUntilReady()
                const user = await signer.user()
                localStorage.setItem(NOSTR_STORED_PUBKEY, user.pubkey)
            } catch (err) {
                console.error('Failed to store pubkey:', err)
            }

            // Remove any unencrypted key for security
            localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)

            return true
        } catch (error) {
            console.error('Failed to encrypt and store private key:', error)
            throw error
        }
    },

    loginWithPrivateKey: async (privateKey: string) => {
        const ndk = ndkActions.getNDK()
        if (!ndk) throw new Error('NDK not initialized')

        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))
            const signer = new NDKPrivateKeySigner(privateKey)

            await signer.blockUntilReady()
            ndkActions.setSigner(signer)

            const user = await signer.user()

            authStore.setState((state) => ({
                ...state,
                user,
                isAuthenticated: true,
            }))

            return user
        } catch (error) {
            authStore.setState((state) => ({
                ...state,
                isAuthenticated: false,
            }))
            throw error
        } finally {
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    },

    loginWithExtension: async () => {
        const ndk = ndkActions.getNDK()
        if (!ndk) throw new Error('NDK not initialized')

        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))
            const signer = new NDKNip07Signer()
            await signer.blockUntilReady()
            ndkActions.setSigner(signer)

            const user = await signer.user()

            authStore.setState((state) => ({
                ...state,
                user,
                isAuthenticated: true,
            }))

            return user
        } catch (error) {
            authStore.setState((state) => ({
                ...state,
                isAuthenticated: false,
            }))
            throw error
        } finally {
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    },

    loginWithNip46: async (bunkerUrl: string, localSigner: NDKPrivateKeySigner) => {
        const ndk = ndkActions.getNDK()
        if (!ndk) throw new Error('NDK not initialized')

        // Store credentials for later reconnection
        localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey || '')
        localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))

            // Ensure NDK is connected - check if we have active relays
            if (ndk.pool?.relays.size === 0) {
                await ndkActions.connect()
            }

            const signer = new NDKNip46Signer(ndk, bunkerUrl, localSigner)
            await signer.blockUntilReady()
            ndkActions.setSigner(signer)
            const user = await signer.user()

            authStore.setState((state) => ({
                ...state,
                user,
                isAuthenticated: true,
            }))

            return user
        } catch (error) {
            // Clean up stored credentials on error
            localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
            localStorage.removeItem(NOSTR_CONNECT_KEY)

            authStore.setState((state) => ({
                ...state,
                isAuthenticated: false,
            }))
            throw error
        } finally {
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    },

    logout: () => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return
        ndkActions.removeSigner()

        // Clean up all storage keys on logout
        localStorage.removeItem(NOSTR_LOCAL_SIGNER_KEY)
        localStorage.removeItem(NOSTR_CONNECT_KEY)
        localStorage.removeItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY)
        localStorage.removeItem(NOSTR_AUTO_LOGIN)
        localStorage.removeItem(NOSTR_STORED_PUBKEY)
        localStorage.removeItem(NOSTR_CONNECTION_ATTEMPT)

        // Reset to initial state
        authStore.setState(() => ({ ...initialState }))
    },
}

export const useAuth = () => {
    return {
        ...authStore.state,
        ...authActions,
    }
}
