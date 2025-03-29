import { NDKNip07Signer, NDKNip46Signer, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk'
import { Store } from '@tanstack/store'
import { ndkActions } from './ndk'

export const NOSTR_CONNECT_KEY = 'nostr_connect_url'
export const NOSTR_LOCAL_SIGNER_KEY = 'nostr_local_signer_key'
export const NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY = 'nostr_local_encrypted_signer_key'
export const NOSTR_AUTO_LOGIN = 'nostr_auto_login'

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

export const authStore = new Store<AuthState>(initialState)
export const authActions = {
    getAuthFromLocalStorageAndLogin: async () => {
        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))
            const privateKey = localStorage.getItem(NOSTR_LOCAL_SIGNER_KEY)
            const bunkerUrl = localStorage.getItem(NOSTR_CONNECT_KEY)
            if (privateKey && bunkerUrl) {
                await authActions.loginWithNip46(bunkerUrl, new NDKPrivateKeySigner(privateKey))
                return
            }

            const encryptedPrivateKey = localStorage.getItem(NOSTR_LOCAL_ENCRYPTED_SIGNER_KEY)
            if (encryptedPrivateKey) {
                const autoLogin = localStorage.getItem(NOSTR_AUTO_LOGIN)
                if (autoLogin !== 'true') {
                    authStore.setState((state) => ({ ...state, needsDecryptionPassword: true }))
                    return
                }

                try {
                    // For now, just use the simple placeholder format until proper encryption is implemented
                    if (encryptedPrivateKey.startsWith('placeholder:')) {
                        const [, key] = encryptedPrivateKey.split(':')
                        await authActions.loginWithPrivateKey(key)
                    } else {
                        authStore.setState((state) => ({ ...state, needsDecryptionPassword: true }))
                    }
                } catch (error) {
                    console.error('Auto login failed:', error)
                    authStore.setState((state) => ({ ...state, needsDecryptionPassword: true }))
                }
                return
            }

            await authActions.loginWithExtension()
        } catch (error) {
            console.error('Authentication failed:', error)
        } finally {
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

            // For now, we're using a simple placeholder format
            // TODO: Implement proper encryption/decryption
            if (encryptedPrivateKey.startsWith('placeholder:')) {
                const [, key] = encryptedPrivateKey.split(':')
                await authActions.loginWithPrivateKey(key)
            } else {
                throw new Error('Invalid key format')
            }

            authStore.setState((state) => ({ ...state, needsDecryptionPassword: false }))
        } catch (error) {
            throw error
        } finally {
            authStore.setState((state) => ({ ...state, isAuthenticating: false }))
        }
    },

    loginWithPrivateKey: async (privateKey: string) => {
        const ndk = ndkActions.getNDK()
        if (!ndk) throw new Error('NDK not initialized')

        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))
            const signer = new NDKPrivateKeySigner(privateKey)

            console.log('signer', signer)

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

        localStorage.setItem(NOSTR_LOCAL_SIGNER_KEY, localSigner.privateKey || '')
        localStorage.setItem(NOSTR_CONNECT_KEY, bunkerUrl)

        try {
            authStore.setState((state) => ({ ...state, isAuthenticating: true }))
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

        authStore.setState(() => initialState)
    },
}

export const useAuth = () => {
    return {
        ...authStore.state,
        ...authActions,
    }
}
