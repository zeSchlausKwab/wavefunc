import NDK, {
    NDKEvent,
    type NDKCacheAdapter,
    type NDKFilter,
    type NDKSigner,
    type NDKUserProfile,
} from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'

// Define a type for relay configuration
export interface RelayConfig {
    url: string
    read: boolean
    write: boolean
}

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

        this.ndk.signer = signer || undefined
    }

    /**
     * Get the list of configured relays
     * @returns Array of relay configurations
     */
    public getRelays(): RelayConfig[] {
        if (!this.ndk) {
            return []
        }

        const relays: RelayConfig[] = []

        // Get all relay objects from NDK
        for (const [url, relayObj] of Object.entries(this.ndk.pool.relays)) {
            relays.push({
                url,
                read: relayObj.settings?.read !== false, // Default to true if not set
                write: relayObj.settings?.write !== false, // Default to true if not set
            })
        }

        return relays
    }

    /**
     * Update the list of relays
     * @param relays Array of relay configurations to set
     */
    public async updateRelays(relays: RelayConfig[]): Promise<void> {
        if (!this.ndk) {
            throw new Error('NDK instance not available')
        }

        // Store the relay configuration in localStorage for persistence
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('RELAY_LIST', JSON.stringify(relays))
        }

        try {
            // Explicitly set the relays
            const relayUrls = relays.map((relay) => relay.url)

            // Update the explicit relay URLs
            this.ndk.explicitRelayUrls = relayUrls

            // // Set individual relay settings
            // for (const relay of relays) {
            //     if (this.ndk.pool.relays[relay.url]) {
            //         // Update existing relay settings
            //         this.ndk.pool.relays.get(relay.url)?.settings = {
            //             read: relay.read,
            //             write: relay.write,
            //         }
            //     }
            // }

            // Reconnect to apply changes
            if (this.config.enableLogging) {
                console.log('Relay configuration updated, reconnecting...')
            }

            // For a complete refresh, we'd need to re-initialize NDK
            // but for now we'll just log that relays were updated
            if (this.config.enableLogging) {
                console.log('Relay settings updated:', relayUrls)
            }
        } catch (error) {
            console.error('Failed to update relays:', error)
            throw error
        }
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

/**
 * Update a user's profile
 * @param ndk NDK instance
 * @param pubkey The public key of the user
 * @param profile The profile data to update
 * @param overwrite Whether to completely overwrite the existing profile (default: false)
 * @returns Promise<NDKEvent> The published event
 */
export async function updateUserProfile(
    ndk: NDK,
    profile: NDKUserProfile,
    overwrite: boolean = false,
): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available. You need to be signed in to update your profile.')
    }

    const user = await ndk.signer.user()
    const pubkey = user.pubkey

    let finalProfile = { ...profile }

    if (!overwrite) {
        try {
            const user = ndk.getUser({ pubkey })
            const existingProfile = await user.fetchProfile()
            if (existingProfile) {
                finalProfile = {
                    ...existingProfile,
                    ...profile,
                    ...(profile.picture ? { image: profile.picture } : {}),
                    ...(profile.image ? { picture: profile.image } : {}),
                }
            }
        } catch (error) {
            console.warn('Failed to fetch existing profile, using provided data only', error)
        }
    }

    const profileEvent = new NDKEvent(ndk, {
        kind: 0,
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(finalProfile),
        tags: [],
    })

    await profileEvent.sign()
    await profileEvent.publish()

    return profileEvent
}

export const nostrService = NostrService.getInstance()

export type { NDKEvent, NDKFilter, NDKSigner, NDKUserProfile }
