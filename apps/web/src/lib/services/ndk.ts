import NDK, { type NDKSigner, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'
import { generateSecretKey } from 'nostr-tools'

const WS_PROTOCOL = import.meta.env.DEV ? 'ws' : 'wss'
const RELAY_PREFIX = import.meta.env.DEV ? '' : 'relay.'

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'wavefunc-ndk-cache' })

class NostrService {
    private static instance: NostrService
    private ndk: NDK
    private anonymousSigner: NDKPrivateKeySigner | null = null

    private constructor() {
        const relayUrl = `${WS_PROTOCOL}://${RELAY_PREFIX}${import.meta.env.PUBLIC_HOST}:${import.meta.env.PUBLIC_RELAY_PORT}`
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
        // If we don't have a signer, create an anonymous one
        if (!this.ndk.signer) {
            await this.createAnonymousSigner()
        }
        await this.ndk.connect()
    }

    public async createAnonymousSigner(): Promise<void> {
        // Don't create a new one if we already have one
        if (this.anonymousSigner) {
            return
        }

        // Check if we have a stored anonymous key
        const storedKey = localStorage.getItem('ANONYMOUS_PRIVATE_KEY')
        const privateKey = storedKey ? new Uint8Array(JSON.parse(storedKey)) : generateSecretKey()

        // Store the key if it's new
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
        // If signer is null and we have an anonymous signer, use that
        if (!signer && this.anonymousSigner) {
            this.ndk.signer = this.anonymousSigner
            return
        }

        // Otherwise set the provided signer or undefined
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
