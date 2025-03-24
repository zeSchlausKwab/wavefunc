import NDK, { type NDKSigner } from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'

const WS_PROTOCOL = import.meta.env.VITE_PUBLIC_APP_ENV === 'development' ? 'ws' : 'wss'
const RELAY_PREFIX = import.meta.env.VITE_PUBLIC_APP_ENV === 'development' ? '' : 'relay.'
const PORT_OR_DEFAULT =
    import.meta.env.VITE_PUBLIC_APP_ENV === 'development' ? `:${import.meta.env.VITE_PUBLIC_RELAY_PORT}` : ''

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'wavefunc-ndk-cache' })

class NostrService {
    private static instance: NostrService
    private ndk: NDK

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
        await this.ndk.connect()
    }

    public getNDK(): NDK {
        return this.ndk
    }

    public setSigner(signer: NDKSigner | null): void {
        this.ndk.signer = signer || undefined
    }
}

export const nostrService = NostrService.getInstance()
