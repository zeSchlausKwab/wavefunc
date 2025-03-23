import NDK, {
    NDKPrivateKeySigner,
    type NDKCacheAdapter,
    type NDKEvent,
    type NDKFilter,
    type NDKSigner,
} from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'
import { generateSecretKey } from 'nostr-tools/pure'

// Configuration can be overridden during initialization
interface NDKServiceConfig {
    host?: string
    relayPort?: string | number
    webPort?: string | number
    useCache?: boolean
    defaultRelays?: string[]
    enableLogging?: boolean
}

export class NostrService {
    private static instance: NostrService | null = null
    private ndk: NDK | null = null
    private anonymousSigner: NDKPrivateKeySigner | null = null
    private isInitialized = false
    private config: NDKServiceConfig = {
        host: 'localhost',
        relayPort: 3002,
        webPort: 8080,
        useCache: true,
        enableLogging: false,
    }
    private cacheAdapter: NDKCacheAdapterDexie | null = null

    private constructor() {
        // Private constructor for singleton pattern
    }

    public static getInstance(): NostrService {
        if (!NostrService.instance) {
            NostrService.instance = new NostrService()
        }
        return NostrService.instance
    }

    /**
     * Initialize the NDK service with configuration
     */
    public init(config: NDKServiceConfig = {}): void {
        if (this.isInitialized) {
            console.warn('NDK Service is already initialized')
            return
        }

        // Merge provided config with defaults
        this.config = { ...this.config, ...config }

        if (this.config.enableLogging) {
            console.log('Initializing NDK Service with config:', this.config)
        }

        // Determine protocol and prefix based on environment
        const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
        const wsProtocol = isProduction ? 'wss' : 'ws'
        const relayPrefix = isProduction ? 'relay.' : ''
        const portOrDefault = isProduction ? '' : `:${this.config.relayPort}`

        // Determine relay URL
        const relayUrl = `${wsProtocol}://${relayPrefix}${this.config.host}${portOrDefault}`

        // Setup cache if enabled
        if (this.config.useCache && typeof window !== 'undefined') {
            try {
                this.cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'wavefunc-ndk-cache' })
            } catch (error) {
                console.warn('Failed to initialize NDK cache adapter:', error)
            }
        }

        // Initialize NDK with the relay
        this.ndk = new NDK({
            explicitRelayUrls: this.config.defaultRelays || [relayUrl],
            cacheAdapter: this.cacheAdapter as unknown as NDKCacheAdapter,
        })

        this.isInitialized = true

        if (this.config.enableLogging) {
            console.log(`NDK Service initialized with relay: ${relayUrl}`)
        }
    }

    /**
     * Connect to the NDK relay(s)
     */
    public async connect(): Promise<void> {
        if (!this.isInitialized) {
            throw new Error('NDK Service must be initialized before connecting')
        }

        if (!this.ndk) {
            throw new Error('NDK instance not available')
        }

        // Check if we have a bunker URL or other authentication method first
        const hasBunkerUrl = typeof localStorage !== 'undefined' && localStorage.getItem('nostr_connect_url')

        // Only create anonymous signer if no signer is set and no bunker URL exists
        if (!this.ndk.signer && !hasBunkerUrl) {
            await this.createAnonymousSigner()
        }

        // Connect to relays
        try {
            await this.ndk.connect()
            if (this.config.enableLogging) {
                console.log('Connected to NDK relays')
            }
        } catch (error) {
            console.error('Failed to connect to NDK relays:', error)
            throw error
        }
    }

    /**
     * Create an anonymous signer for the NDK instance
     */
    public async createAnonymousSigner(): Promise<void> {
        if (!this.ndk) {
            throw new Error('NDK instance not available')
        }

        if (this.anonymousSigner) {
            this.ndk.signer = this.anonymousSigner
            return
        }

        let privateKey: string

        // In browser environments, try to use localStorage
        if (typeof localStorage !== 'undefined') {
            const storedKey = localStorage.getItem('ANONYMOUS_PRIVATE_KEY')

            if (storedKey) {
                // Use existing key
                privateKey = storedKey
            } else {
                // Generate a new key and convert from Uint8Array to hex string
                const secretKey = generateSecretKey()
                privateKey = Array.from(secretKey)
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('')
                localStorage.setItem('ANONYMOUS_PRIVATE_KEY', privateKey)
            }
        } else {
            // For non-browser environments (Node.js)
            const secretKey = generateSecretKey()
            privateKey = Array.from(secretKey)
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('')
        }

        this.anonymousSigner = new NDKPrivateKeySigner(privateKey)
        await this.anonymousSigner.blockUntilReady()
        this.ndk.signer = this.anonymousSigner

        if (this.config.enableLogging) {
            console.log('Anonymous signer created and set')
        }
    }

    /**
     * Get the NDK instance
     */
    public getNDK(): NDK | null {
        return this.ndk
    }

    /**
     * Set a custom signer for the NDK instance
     */
    public setSigner(signer: NDKSigner | null): void {
        if (!this.ndk) {
            throw new Error('NDK instance not available')
        }

        if (!signer && this.anonymousSigner) {
            this.ndk.signer = this.anonymousSigner
            return
        }

        this.ndk.signer = signer || undefined
    }

    /**
     * Check if the current signer is the anonymous signer
     */
    public isAnonymousSigner(signer: NDKSigner | null | undefined): boolean {
        return signer === this.anonymousSigner
    }

    /**
     * Get the anonymous signer
     */
    public getAnonymousSigner(): NDKPrivateKeySigner | null {
        return this.anonymousSigner
    }

    /**
     * Fetch events from Nostr relays with timeout and retry
     */
    public async fetchEvents(
        filter: NDKFilter,
        timeoutMs: number = 5000,
        maxAttempts: number = 3,
    ): Promise<Set<NDKEvent>> {
        if (!this.ndk) {
            throw new Error('NDK instance not available')
        }

        let attempts = 0
        let events: Set<NDKEvent> | undefined

        while (attempts < maxAttempts) {
            try {
                const fetchPromise = this.ndk.fetchEvents(filter)
                const fetchTimeoutPromise = new Promise<Set<NDKEvent>>((_, reject) =>
                    setTimeout(() => reject(new Error('Fetch events timeout')), timeoutMs),
                )

                events = await Promise.race([fetchPromise, fetchTimeoutPromise])
                break
            } catch (err) {
                attempts++
                if (attempts >= maxAttempts) throw err
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
        }

        if (!events) {
            throw new Error('Failed to fetch events after multiple attempts')
        }

        return events
    }
}

// Export a singleton instance
export const nostrService = NostrService.getInstance()

// Re-export NDK types for convenience
export type { NDKEvent, NDKFilter, NDKSigner }
