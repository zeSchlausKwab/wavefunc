import type { NDKRelay, NDKSigner } from '@nostr-dev-kit/ndk'
import NDK from '@nostr-dev-kit/ndk'
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie'
import { Store } from '@tanstack/store'
import { DEFAULT_RELAYS } from '@wavefunc/common'

// Helper function to normalize relay URLs by removing trailing slashes
const normalizeUrl = (url: string): string => (url.endsWith('/') ? url.slice(0, -1) : url)

interface NDKState {
    ndk: NDK | null
    isConnecting: boolean
    isConnected: boolean
    connectedRelayCount: number
    explicitRelayUrls: string[]
}

const initialState: NDKState = {
    ndk: null,
    isConnecting: false,
    isConnected: false,
    connectedRelayCount: 0,
    explicitRelayUrls: [],
}

export const ndkStore = new Store<NDKState>(initialState)

export const ndkActions = {
    initialize: (relays?: string[]) => {
        const state = ndkStore.state
        if (state.ndk) return state.ndk

        // @ts-ignore - Ignoring type mismatch between NDK and NDKCacheAdapterDexie
        const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'nostr-cache' })

        // Get saved relays from localStorage, fallback to defaults
        let explicitRelayUrls: string[] = []
        try {
            const savedRelays = localStorage.getItem('RELAY_LIST')
            if (savedRelays) {
                const parsedRelays = JSON.parse(savedRelays) as Array<{ url: string; read: boolean; write: boolean }>
                explicitRelayUrls = parsedRelays.map((r) => normalizeUrl(r.url))
            }
        } catch (error) {
            console.warn('Failed to load relays from localStorage, using defaults:', error)
        }

        // Use provided relays, saved relays, or defaults (in that order)
        if (relays && relays.length > 0) {
            explicitRelayUrls = relays.map(normalizeUrl)
        } else if (explicitRelayUrls.length === 0) {
            explicitRelayUrls = DEFAULT_RELAYS.map(normalizeUrl)
        }

        // Deduplicate relay URLs
        explicitRelayUrls = [...new Set(explicitRelayUrls)]

        const ndk = new NDK({
            // @ts-ignore - Ignoring type mismatch between NDK and cache adapter
            cacheAdapter: dexieAdapter,
            explicitRelayUrls,
        })

        // Set up relay event listeners for monitoring
        ndk.pool.on('relay:connect', (relay: NDKRelay) => {
            console.log('Connected to relay:', relay.url)
            const state = ndkStore.state
            ndkStore.setState((state) => ({
                ...state,
                connectedRelayCount: state.connectedRelayCount + 1,
                isConnected: true, // Mark as connected once we have at least one relay
            }))
        })

        ndk.pool.on('relay:disconnect', (relay: NDKRelay) => {
            console.log('Disconnected from relay:', relay.url)
            const state = ndkStore.state
            const newCount = Math.max(0, state.connectedRelayCount - 1)
            ndkStore.setState((state) => ({
                ...state,
                connectedRelayCount: newCount,
                isConnected: newCount > 0, // Only mark as disconnected if no relays left
            }))
        })

        ndkStore.setState((state) => ({
            ...state,
            ndk,
            explicitRelayUrls,
        }))

        return ndk
    },

    connect: async (timeoutMs: number = 2000): Promise<void> => {
        const state = ndkStore.state
        if (!state.ndk || state.isConnecting) return

        ndkStore.setState((state) => ({ ...state, isConnecting: true }))

        try {
            console.log('Connecting to relays:', state.explicitRelayUrls)

            // Use NDK's built-in timeout for connection attempts
            await state.ndk.connect(timeoutMs)

            // Don't wait for all relays - NDK will continue connecting in background
            console.log('NDK connection initiated with timeout:', timeoutMs + 'ms')
        } catch (error) {
            console.warn('Some relays failed to connect, but continuing:', error)
            // Don't treat connection errors as fatal - app should work with partial connectivity
        } finally {
            ndkStore.setState((state) => ({ ...state, isConnecting: false }))
        }
    },

    addRelay: (url: string): boolean => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            const normalizedUrl = normalizeUrl(url)
            new URL(normalizedUrl) // Validate URL

            // Check if relay already exists
            if (state.explicitRelayUrls.includes(normalizedUrl)) {
                console.log('Relay already exists:', normalizedUrl)
                return true
            }

            // Add to NDK and state
            state.ndk.addExplicitRelay(normalizedUrl)
            const updatedUrls = [...state.explicitRelayUrls, normalizedUrl]
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: updatedUrls }))

            // Save to localStorage
            ndkActions.saveRelaysToStorage(updatedUrls)

            return true
        } catch (error) {
            console.error('Failed to add relay:', error)
            return false
        }
    },

    removeRelay: (url: string): boolean => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            const normalizedUrl = normalizeUrl(url)

            // Remove from NDK pool
            state.ndk.pool.relays.delete(normalizedUrl)

            // Update state
            const updatedUrls = state.explicitRelayUrls.filter((r) => r !== normalizedUrl)
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: updatedUrls }))

            // Save to localStorage
            ndkActions.saveRelaysToStorage(updatedUrls)

            return true
        } catch (error) {
            console.error('Failed to remove relay:', error)
            return false
        }
    },

    updateRelays: async (relayConfigs: { url: string; read: boolean; write: boolean }[]): Promise<boolean> => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            // Clear existing relays
            state.ndk.pool.relays.clear()

            // Add new relays
            const newUrls = relayConfigs.map((r) => normalizeUrl(r.url))
            newUrls.forEach((url) => {
                state.ndk!.addExplicitRelay(url)
            })

            // Update state
            ndkStore.setState((state) => ({
                ...state,
                explicitRelayUrls: newUrls,
                connectedRelayCount: 0, // Reset count since we're reconnecting
            }))

            // Save to localStorage
            localStorage.setItem('RELAY_LIST', JSON.stringify(relayConfigs))

            // Reconnect with timeout
            await ndkActions.connect(2000)

            return true
        } catch (error) {
            console.error('Error updating relays:', error)
            return false
        }
    },

    saveRelaysToStorage: (urls: string[]) => {
        try {
            const relayConfigs = urls.map((url) => ({ url, read: true, write: true }))
            localStorage.setItem('RELAY_LIST', JSON.stringify(relayConfigs))
        } catch (error) {
            console.error('Failed to save relays to localStorage:', error)
        }
    },

    getRelays: () => {
        const state = ndkStore.state
        if (!state.ndk) return []

        try {
            const savedRelays = localStorage.getItem('RELAY_LIST')
            if (savedRelays) {
                return JSON.parse(savedRelays) as Array<{ url: string; read: boolean; write: boolean }>
            }
        } catch (error) {
            console.error('Failed to load relays from localStorage:', error)
        }

        // Fallback to current explicit relays
        return state.explicitRelayUrls.map((url) => ({ url, read: true, write: true }))
    },

    setSigner: (signer: NDKSigner | undefined) => {
        const state = ndkStore.state
        if (!state.ndk) return
        state.ndk.signer = signer
    },

    removeSigner: () => {
        const state = ndkStore.state
        if (!state.ndk) return
        state.ndk.signer = undefined
    },

    getNDK: () => {
        return ndkStore.state.ndk
    },

    getUser: () => {
        const state = ndkStore.state
        if (!state.ndk || !state.ndk.signer) return null
        return state.ndk.signer.user
    },

    getSigner: () => {
        return ndkStore.state.ndk?.signer
    },

    getState: () => {
        return ndkStore.state
    },

    // Add all default relays at once
    addDefaultRelays: async (): Promise<boolean> => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            const currentUrls = new Set(state.explicitRelayUrls)
            const newUrls = DEFAULT_RELAYS.filter((url) => !currentUrls.has(normalizeUrl(url)))

            if (newUrls.length === 0) {
                console.log('All default relays already added')
                return true
            }

            // Add new relays
            newUrls.forEach((url) => {
                state.ndk!.addExplicitRelay(normalizeUrl(url))
            })

            const allUrls = [...state.explicitRelayUrls, ...newUrls.map(normalizeUrl)]
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: allUrls }))

            // Save to localStorage
            ndkActions.saveRelaysToStorage(allUrls)

            console.log('Added default relays:', newUrls)
            return true
        } catch (error) {
            console.error('Failed to add default relays:', error)
            return false
        }
    },
}

// React hook for consuming the store
export const useNDK = () => {
    return {
        ...ndkStore.state,
        ...ndkActions,
    }
}
