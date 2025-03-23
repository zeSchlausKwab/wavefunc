import { Store } from '@tanstack/store'
import { NDKPrivateKeySigner, NDKUser, type NDKSigner, NDKNip07Signer, NDKNip46Signer } from '@nostr-dev-kit/ndk'
import { nostrService } from '@/lib/services/ndk'
import { encrypt, decrypt } from 'nostr-tools/nip49'
import { nip19 } from 'nostr-tools'

export interface AuthState {
    status: 'loading' | 'authenticated' | 'anonymous' | 'error'
    user: NDKUser | null
    signer: NDKSigner | null
    error: Error | null
    isLoginDialogOpen: boolean
    privateKeyValidated: boolean
    privateKeyToEncrypt: string | null
}

export const authStore = new Store<AuthState>({
    status: 'loading',
    user: null,
    signer: null,
    error: null,
    isLoginDialogOpen: false,
    privateKeyValidated: false,
    privateKeyToEncrypt: null,
})

const createNcryptSec = (nsecKey: string, password: string) => {
    try {
        const { type, data } = nip19.decode(nsecKey)
        if (type !== 'nsec') throw new Error('Invalid key format, expected nsec')

        const decodedSk = data as Uint8Array
        const created = Math.floor(Date.now() / 1000)

        try {
            return { decodedSk, ncryptsec: encrypt(decodedSk, password, created) }
        } catch {
            const textEncoder = new TextEncoder()
            const pwBytes = textEncoder.encode(password)
            const allBytes = new Uint8Array(pwBytes.length + decodedSk.length + 1)

            allBytes.set(pwBytes)
            allBytes[pwBytes.length] = 58 // ':' character
            allBytes.set(decodedSk, pwBytes.length + 1)

            const base64Encoded = btoa(
                Array.from(allBytes)
                    .map((b) => String.fromCharCode(b))
                    .join(''),
            )
            return { decodedSk, ncryptsec: 'ncrypt1:' + base64Encoded }
        }
    } catch (error) {
        throw new Error('Failed to encrypt private key: ' + (error instanceof Error ? error.message : String(error)))
    }
}

const decryptKey = (encryptedKey: string, password: string): Uint8Array => {
    if (encryptedKey.startsWith('ncrypt1:')) {
        const payload = encryptedKey.substring(8)
        const base64Decoded = atob(payload)
        const bytes = new Uint8Array(base64Decoded.length)

        for (let i = 0; i < base64Decoded.length; i++) {
            bytes[i] = base64Decoded.charCodeAt(i)
        }

        const colonIndex = Array.from(bytes).findIndex((b) => b === 58)
        if (colonIndex === -1) throw new Error('Invalid encryption format')

        const passwordBytes = bytes.slice(0, colonIndex)
        const keyBytes = bytes.slice(colonIndex + 1)

        const storedPassword = new TextDecoder().decode(passwordBytes)
        if (storedPassword !== password) throw new Error('Invalid password')

        return keyBytes
    } else {
        const decrypted = decrypt(encryptedKey, password)
        if (!decrypted) throw new Error('Failed to decrypt private key')
        return decrypted
    }
}

const createSigner = async (privateKey: Uint8Array): Promise<{ signer: NDKPrivateKeySigner; user: NDKUser }> => {
    const hexKey = Array.from(privateKey)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    const signer = new NDKPrivateKeySigner(hexKey)

    await signer.blockUntilReady()
    nostrService.setSigner(signer)

    const user = await signer.user()
    await user.fetchProfile()

    return { signer, user }
}

const updateAuthState = (state: Partial<AuthState>) => {
    authStore.setState((current) => ({ ...current, ...state }))
}

const persistUserSession = (user: NDKUser, isAnonymous = false) => {
    if (typeof window === 'undefined') return

    const persistData = {
        pubkey: user.pubkey,
        profile: user.profile,
        ...(isAnonymous ? { isAnonymous: true } : {}),
    }

    sessionStorage.setItem(isAnonymous ? 'ANONYMOUS_AUTH_STATE' : 'AUTH_STATE', JSON.stringify(persistData))
}

const storageKeys = {
    encryptedKey: 'ENCRYPTED_PRIVATE_KEY',
    pubkey: 'AUTH_PUBKEY',
    authState: 'AUTH_STATE',
    anonymousState: 'ANONYMOUS_AUTH_STATE',
}

const getEncryptedKeyInfo = () => ({
    encryptedKey: localStorage.getItem(storageKeys.encryptedKey),
    pubkey: localStorage.getItem(storageKeys.pubkey),
})

const initAuth = async () => {
    try {
        const storedLocalSignerKey = localStorage.getItem('nostr_local_signer_key')
        const storedConnectUrl = localStorage.getItem('nostr_connect_url')

        if (storedLocalSignerKey && storedConnectUrl) {
            try {
                const localSigner = new NDKPrivateKeySigner(storedLocalSignerKey)
                await localSigner.blockUntilReady()

                const ndk = nostrService.getNDK()
                if (!ndk) throw new Error('NDK not initialized')

                const nip46Signer = new NDKNip46Signer(ndk, storedConnectUrl, localSigner)
                await nip46Signer.blockUntilReady()

                nostrService.setSigner(nip46Signer)

                const user = await nip46Signer.user()
                await user.fetchProfile()

                persistUserSession(user)

                updateAuthState({
                    status: 'authenticated',
                    user,
                    signer: nip46Signer,
                    error: null,
                })

                return // Skip anonymous signer creation
            } catch (error) {
                localStorage.removeItem('nostr_local_signer_key')
                localStorage.removeItem('nostr_connect_url')
            }
        }

        await nostrService.createAnonymousSigner()
        const signer = nostrService.getAnonymousSigner()
        if (!signer) throw new Error('Failed to create anonymous signer')

        const user = await signer.user()
        updateAuthState({ status: 'anonymous', user, signer, error: null })

        nostrService.connect().then(async () => {
            try {
                await user.fetchProfile()
                persistUserSession(user, true)
                updateAuthState({ user })
            } catch (error) {
                console.error('Failed to fetch profile:', error)
            }
        })
    } catch (error) {
        updateAuthState({
            status: 'error',
            error: error instanceof Error ? error : new Error('Failed to initialize anonymous user'),
        })
    }
}

initAuth()

export const auth = {
    store: authStore,

    openLoginDialog() {
        updateAuthState({
            isLoginDialogOpen: true,
            privateKeyValidated: false,
            privateKeyToEncrypt: null,
        })
    },

    closeLoginDialog() {
        updateAuthState({
            isLoginDialogOpen: false,
            privateKeyValidated: false,
            privateKeyToEncrypt: null,
            error: null,
        })
    },

    async validatePrivateKey(privateKey: string) {
        try {
            updateAuthState({ status: 'loading', error: null })

            if (!privateKey.startsWith('nsec1')) {
                throw new Error('Invalid private key format. Must be nsec1 format.')
            }

            updateAuthState({
                status: 'anonymous',
                privateKeyValidated: true,
                privateKeyToEncrypt: privateKey,
                error: null,
            })

            return true
        } catch (error) {
            updateAuthState({
                status: 'anonymous',
                error: error instanceof Error ? error : new Error('Unknown error occurred'),
                privateKeyValidated: false,
                privateKeyToEncrypt: null,
            })
            throw error
        }
    },

    async encryptAndLoginWithPrivateKey(password: string) {
        let privateKey: string | null = null

        try {
            privateKey = authStore.state.privateKeyToEncrypt
            if (!privateKey) throw new Error('No private key to encrypt')

            updateAuthState({ status: 'loading', error: null })

            const { decodedSk, ncryptsec } = createNcryptSec(privateKey, password)
            const { signer, user } = await createSigner(decodedSk)

            localStorage.setItem(storageKeys.encryptedKey, ncryptsec)
            localStorage.setItem(storageKeys.pubkey, user.pubkey)

            persistUserSession(user)

            updateAuthState({
                status: 'authenticated',
                user,
                signer,
                error: null,
                isLoginDialogOpen: false,
                privateKeyValidated: false,
                privateKeyToEncrypt: null,
            })

            return true
        } catch (error) {
            updateAuthState({
                status: 'error',
                error: error instanceof Error ? error : new Error('Unknown error occurred'),
                privateKeyValidated: true,
                privateKeyToEncrypt: privateKey,
            })
            throw error
        }
    },

    async loginWithPrivateKey(privateKey: string, password?: string) {
        if (password) {
            updateAuthState({
                privateKeyValidated: true,
                privateKeyToEncrypt: privateKey,
            })
            return this.encryptAndLoginWithPrivateKey(password)
        }
        return this.validatePrivateKey(privateKey)
    },

    async loginWithEncryptedKey(password: string) {
        try {
            updateAuthState({ status: 'loading', error: null })

            const { encryptedKey, pubkey } = getEncryptedKeyInfo()
            if (!encryptedKey || !pubkey) throw new Error('No encrypted key found')

            const privateKey = decryptKey(encryptedKey, password)
            const { signer, user } = await createSigner(privateKey)

            if (user.pubkey !== pubkey) throw new Error('Decrypted key does not match stored public key')

            persistUserSession(user)

            updateAuthState({
                status: 'authenticated',
                user,
                signer,
                error: null,
                isLoginDialogOpen: false,
            })

            return true
        } catch (error) {
            updateAuthState({
                status: 'error',
                error: error instanceof Error ? error : new Error('Unknown error occurred'),
            })
            throw error
        }
    },

    async loginWithExtension() {
        try {
            updateAuthState({ status: 'loading', error: null })

            const signer = new NDKNip07Signer()

            try {
                await signer.blockUntilReady()
            } catch {
                throw new Error('Extension not responding. Please check if it is unlocked and permissions are granted.')
            }

            nostrService.setSigner(signer)

            const user = await signer.user()
            await user.fetchProfile()

            persistUserSession(user)

            updateAuthState({
                status: 'authenticated',
                user,
                signer,
                error: null,
                isLoginDialogOpen: false,
            })
        } catch (error) {
            updateAuthState({
                status: 'error',
                error: error instanceof Error ? error : new Error('Extension login failed'),
            })
            throw error
        }
    },

    async loginWithNostrConnect(signer: NDKNip46Signer) {
        try {
            updateAuthState({ status: 'loading', error: null })
            await signer.blockUntilReady()
            nostrService.setSigner(signer)

            const user = await signer.user()
            await user.fetchProfile()

            persistUserSession(user)

            localStorage.removeItem('ANONYMOUS_PRIVATE_KEY')

            updateAuthState({
                status: 'authenticated',
                user,
                signer,
                error: null,
                isLoginDialogOpen: false,
            })
        } catch (error) {
            updateAuthState({
                status: 'error',
                error: error instanceof Error ? error : new Error('Nostr Connect login failed'),
            })
            throw error
        }
    },

    hasEncryptedKey() {
        const { encryptedKey, pubkey } = getEncryptedKeyInfo()
        return !!encryptedKey && !!pubkey
    },

    getStoredPubkey() {
        return localStorage.getItem(storageKeys.pubkey)
    },

    logout() {
        sessionStorage.removeItem(storageKeys.authState)
        localStorage.removeItem(storageKeys.encryptedKey)
        localStorage.removeItem(storageKeys.pubkey)
        localStorage.removeItem('nostr_local_signer_key')
        localStorage.removeItem('nostr_connect_url')

        this.restoreAnonymousUser()
    },

    clearStoredKeys() {
        localStorage.removeItem(storageKeys.encryptedKey)
        localStorage.removeItem(storageKeys.pubkey)

        updateAuthState({
            isLoginDialogOpen: false,
            privateKeyValidated: false,
            privateKeyToEncrypt: null,
        })

        this.restoreAnonymousUser()
    },

    restoreAnonymousUser() {
        const anonymousSigner = nostrService.getAnonymousSigner()
        if (!anonymousSigner) {
            updateAuthState({
                status: 'error',
                error: new Error('Failed to restore anonymous signer'),
                privateKeyToEncrypt: null,
            })
            return
        }

        nostrService.setSigner(anonymousSigner)

        anonymousSigner
            .user()
            .then(async (user) => {
                await user.fetchProfile()
                updateAuthState({
                    status: 'anonymous',
                    user,
                    signer: anonymousSigner,
                    error: null,
                    isLoginDialogOpen: false,
                    privateKeyValidated: false,
                    privateKeyToEncrypt: null,
                })
            })
            .catch((error) => {
                updateAuthState({
                    status: 'error',
                    error: error instanceof Error ? error : new Error('Failed to restore anonymous user'),
                })
            })
    },
}

export default auth
