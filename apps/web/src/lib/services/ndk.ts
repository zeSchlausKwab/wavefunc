import NDK, { type NDKSigner, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'
import { generateSecretKey } from 'nostr-tools'

const WS_PROTOCOL = import.meta.env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
const RELAY_PREFIX = import.meta.env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
const PORT_OR_DEFAULT =
    import.meta.env.VITE_PUBLIC_APP_ENV === 'development' ? `:${import.meta.env.VITE_PUBLIC_RELAY_PORT}` : ''

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'wavefunc-ndk-cache' })

class NostrService {
    private static instance: NostrService
    private ndk: NDK
    private anonymousSigner: NDKPrivateKeySigner | null = null

    private constructor() {
        const relayUrl = `${WS_PROTOCOL}://${RELAY_PREFIX}${import.meta.env.VITE_PUBLIC_HOST}${PORT_OR_DEFAULT}`
        console.log('Connecting to relay:', relayUrl)

        this.ndk = new NDK({
            explicitRelayUrls: [relayUrl],
            cacheAdapter: dexieAdapter,
        })
    }

    public static getInstance(): NostrService {
        if (!NostrService.instance) {
            NostrService.instance = new NostrService()
        }
        return NostrService.instance
    }

    public async connect(): Promise<void> {
        if (!this.ndk.signer) {
            await this.createAnonymousSigner()
        }
        await this.ndk.connect()
    }

    public async createAnonymousSigner(): Promise<void> {
        if (this.anonymousSigner) {
            return
        }

        const storedKey = localStorage.getItem('ANONYMOUS_PRIVATE_KEY')
        const privateKey = storedKey ? new Uint8Array(JSON.parse(storedKey)) : generateSecretKey()

        if (!storedKey) {
            localStorage.setItem('ANONYMOUS_PRIVATE_KEY', JSON.stringify(Array.from(privateKey)))
        }

        this.anonymousSigner = new NDKPrivateKeySigner(privateKey)
        await this.anonymousSigner.blockUntilReady()
        this.ndk.signer = this.anonymousSigner
    }

    public getNDK(): NDK {
        return this.ndk
    }

    public setSigner(signer: NDKSigner | null): void {
        if (!signer && this.anonymousSigner) {
            this.ndk.signer = this.anonymousSigner
            return
        }

        this.ndk.signer = signer || undefined
    }

    public isAnonymousSigner(signer: NDKSigner | null | undefined): boolean {
        return signer === this.anonymousSigner
    }

    public getAnonymousSigner(): NDKPrivateKeySigner | null {
        return this.anonymousSigner
    }
}

export const nostrService = NostrService.getInstance()
