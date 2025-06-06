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
    explicitRelayUrls: string[]
    searchNdk: {
        ndk: NDK | null
        isConnecting: boolean
        isConnected: boolean
        url: string[]
    }
}

const initialState: NDKState = {
    ndk: null,
    isConnecting: false,
    isConnected: false,
    explicitRelayUrls: [],
    searchNdk: {
        ndk: null,
        isConnecting: false,
        isConnected: false,
        url: [],
    },
}

export const ndkStore = new Store<NDKState>(initialState)

export const ndkActions = {
    initialize: (relays?: string[]) => {
        const state = ndkStore.state
        if (state.ndk) return state.ndk

        // @ts-ignore - Ignoring type mismatch between NDK and NDKCacheAdapterDexie
        const dexieAdapter = new NDKCacheAdapterDexie({ dbName: 'nostr-cache' })

        // Get saved relays from localStorage
        let explicitRelayUrls: string[] = []
        try {
            const savedRelays = localStorage.getItem('RELAY_LIST')
            if (savedRelays) {
                const parsedRelays = JSON.parse(savedRelays) as Array<{ url: string; read: boolean; write: boolean }>
                explicitRelayUrls = parsedRelays.map((r) => r.url)
            }
        } catch (error) {
            console.error('Failed to load relays from localStorage:', error)
        }

        // Merge provided relays with saved relays, with provided taking precedence
        if (relays && relays.length > 0) {
            // Add any provided relays that aren't already in the list (after normalization)
            relays.forEach((url) => {
                const normalizedUrl = normalizeUrl(url)
                if (!explicitRelayUrls.some((existingUrl) => normalizeUrl(existingUrl) === normalizedUrl)) {
                    explicitRelayUrls.push(url)
                }
            })
        }

        // Deduplicate relay URLs after normalization
        const uniqueRelays = new Map<string, string>()
        explicitRelayUrls.forEach((url) => {
            uniqueRelays.set(normalizeUrl(url), url)
        })
        explicitRelayUrls = Array.from(uniqueRelays.values())

        const ndk = new NDK({
            // @ts-ignore - Ignoring type mismatch between NDK and cache adapter
            cacheAdapter: dexieAdapter,
            explicitRelayUrls: explicitRelayUrls.length > 0 ? explicitRelayUrls : [],
        })

        ndkStore.setState((state) => ({
            ...state,
            ndk,
            explicitRelayUrls,
        }))

        return ndk
    },

    connect: async (): Promise<void> => {
        const state = ndkStore.state
        if (!state.ndk || state.isConnected || state.isConnecting) return

        ndkStore.setState((state) => ({ ...state, isConnecting: true }))

        try {
            // Add stored relays to the pool if not already present
            try {
                const savedRelays = localStorage.getItem('RELAY_LIST')
                if (savedRelays) {
                    const parsedRelays = JSON.parse(savedRelays) as Array<{
                        url: string
                        read: boolean
                        write: boolean
                    }>

                    // Check if each saved relay is in the pool already
                    for (const relay of parsedRelays) {
                        if (!state.ndk.pool.relays.has(relay.url)) {
                            state.ndk.addExplicitRelay(relay.url)
                        }
                    }
                }
                console.log('Attempting to connect to relays:', Array.from(state.ndk.pool.relays.keys()))
            } catch (error) {
                console.error('Failed to load relays during connect:', error)
            }

            await state.ndk.connect()
            // NDK.connect() resolves when connection attempts have been initiated.
            // We will assume connection is in progress and let the app proceed.
            // Individual relay statuses can be monitored via NDK pool events if needed elsewhere.
            ndkStore.setState((state) => ({ ...state, isConnected: true }))
            console.log('NDK connection process initiated. explicitRelayUrls:', state.ndk.explicitRelayUrls)
        } catch (error) {
            console.error('Error during NDK connect:', error)
            // Even if there's an error, set isConnected to true to allow app to proceed
            // The app should be able to function with no relays or if initial connection fails
            ndkStore.setState((state) => ({ ...state, isConnected: true }))
        } finally {
            ndkStore.setState((state) => ({ ...state, isConnecting: false }))
        }
    },

    // Initialize the dedicated search NDK instance
    initializeSearchNdk: (url?: string[]) => {
        const state = ndkStore.state
        if (state.searchNdk.ndk) return state.searchNdk.ndk

        // Use the provided URL or the one from state
        const relayUrls = url || state.searchNdk.url

        // Create a new NDK instance specifically for search
        const searchNdk = new NDK({
            explicitRelayUrls: relayUrls,
        })

        ndkStore.setState((state) => ({
            ...state,
            searchNdk: {
                ...state.searchNdk,
                ndk: searchNdk,
                url: relayUrls,
            },
        }))

        return searchNdk
    },

    // Connect to the search NDK
    connectSearchNdk: async (): Promise<void> => {
        const state = ndkStore.state
        if (!state.searchNdk.ndk || state.searchNdk.isConnected || state.searchNdk.isConnecting) return

        ndkStore.setState((state) => ({
            ...state,
            searchNdk: {
                ...state.searchNdk,
                isConnecting: true,
            },
        }))

        try {
            await state.searchNdk.ndk.connect()
            // Similar to the main NDK, let the app proceed after initiating connection.
            ndkStore.setState((state) => ({
                ...state,
                searchNdk: {
                    ...state.searchNdk,
                    isConnected: true,
                },
            }))
            console.log('Search NDK connection process initiated for relay:', state.searchNdk.url)
        } catch (error) {
            console.error('Error during Search NDK connect:', error)
            ndkStore.setState((state) => ({
                ...state,
                searchNdk: {
                    ...state.searchNdk,
                    isConnected: true, // Allow app to proceed
                },
            }))
        } finally {
            ndkStore.setState((state) => ({
                ...state,
                searchNdk: {
                    ...state.searchNdk,
                    isConnecting: false,
                },
            }))
        }
    },

    // Get the search NDK instance
    getSearchNdk: () => {
        return ndkStore.state.searchNdk.ndk
    },

    addExplicitRelay: (relayUrls: string[]): string[] => {
        const state = ndkStore.state
        if (!state.ndk) return []

        relayUrls.forEach((relayUrl) => {
            state.ndk!.addExplicitRelay(relayUrl)
        })

        const updatedUrls = [...state.explicitRelayUrls, ...relayUrls]
        ndkStore.setState((state) => ({ ...state, explicitRelayUrls: updatedUrls }))
        return updatedUrls
    },

    setSigner: (signer: NDKSigner | undefined) => {
        const state = ndkStore.state
        if (!state.ndk) return

        state.ndk.signer = signer
        ndkStore.setState((state) => ({ ...state, signer }))
    },

    removeSigner: () => {
        const state = ndkStore.state
        if (!state.ndk) return
        state.ndk.signer = undefined
        ndkStore.setState((state) => ({ ...state, signer: undefined }))
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

    getRelays: () => {
        const state = ndkStore.state
        if (!state.ndk) return []

        // Get all relay URLs from the NDK pool
        const relaysFromNdk = Array.from(state.ndk.pool.relays.values()).map((relay: NDKRelay) => ({
            url: relay.url,
            read: true, // Default all to true since NDK doesn't expose relay settings directly
            write: true,
        }))

        // Check if we have persisted settings in localStorage
        try {
            const savedRelays = localStorage.getItem('RELAY_LIST')
            if (savedRelays) {
                const parsedRelays = JSON.parse(savedRelays) as Array<{ url: string; read: boolean; write: boolean }>

                // First, make sure all NDK relays are included
                const combinedRelays = [...relaysFromNdk]

                // Then add any localStorage relays that aren't already in the NDK pool
                for (const savedRelay of parsedRelays) {
                    const existingRelayIndex = combinedRelays.findIndex(
                        (r) => normalizeUrl(r.url) === normalizeUrl(savedRelay.url),
                    )
                    if (existingRelayIndex >= 0) {
                        // Update permissions for existing relay
                        combinedRelays[existingRelayIndex].read = savedRelay.read
                        combinedRelays[existingRelayIndex].write = savedRelay.write
                    } else {
                        // Add new relay from localStorage
                        combinedRelays.push(savedRelay)
                    }
                }

                // Deduplicate relays
                const uniqueRelays = new Map<string, { url: string; read: boolean; write: boolean }>()
                combinedRelays.forEach((relay) => {
                    uniqueRelays.set(normalizeUrl(relay.url), relay)
                })

                return Array.from(uniqueRelays.values())
            }
        } catch (error) {
            console.error('Failed to load relays from localStorage:', error)
        }

        // Deduplicate NDK relays before returning
        const uniqueRelays = new Map<string, { url: string; read: boolean; write: boolean }>()
        relaysFromNdk.forEach((relay) => {
            uniqueRelays.set(normalizeUrl(relay.url), relay)
        })

        return Array.from(uniqueRelays.values())
    },

    updateRelays: async (relayConfigs: { url: string; read: boolean; write: boolean }[]) => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            // Store in localStorage for persistence
            localStorage.setItem('RELAY_LIST', JSON.stringify(relayConfigs))

            // Disconnect existing relays in a safer way
            // We'll just reconnect with new relays instead of trying to close the pool
            state.ndk.pool.relays.clear()

            // Add the new relays
            for (const relay of relayConfigs) {
                state.ndk.addExplicitRelay(relay.url)
            }

            // Update explicit relay URLs in the store
            const newExplicitUrls = relayConfigs.map((r) => r.url)
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: newExplicitUrls }))

            // Reconnect to apply changes
            await state.ndk.connect()

            // Wait for at least one connection to be established
            if (relayConfigs.length > 0) {
                await new Promise<void>((resolve) => {
                    const checkConnections = () => {
                        // If at least one relay is connected, resolve
                        for (const relay of state.ndk!.pool.relays.values()) {
                            if (relay.status === 1) {
                                // 1 is typically "connected" in NDK
                                return resolve()
                            }
                        }

                        // Otherwise check again in a moment
                        setTimeout(checkConnections, 100)
                    }

                    // Start checking
                    checkConnections()

                    // Timeout after 5 seconds
                    setTimeout(() => resolve(), 5000)
                })
            }

            return true
        } catch (error) {
            console.error('Error updating relays:', error)
            return false
        }
    },

    // Add a single relay directly
    addRelay: (url: string, read = true, write = true): boolean => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            // Normalize URL
            const normalizedUrl = normalizeUrl(url)
            new URL(normalizedUrl) // Validate URL

            // Check if this relay already exists (after normalization)
            const existingRelays = state.explicitRelayUrls.map(normalizeUrl)
            if (existingRelays.includes(normalizedUrl)) {
                console.log(`Relay ${normalizedUrl} already exists (possibly with different formatting)`)
                return true // Already exists, consider it a success
            }

            // Add to NDK
            state.ndk.addExplicitRelay(normalizedUrl)

            // Update explicitRelayUrls in state
            const updatedUrls = [...state.explicitRelayUrls, normalizedUrl]
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: updatedUrls }))

            // Update stored relay list in localStorage
            const currentRelays = ndkActions.getRelays()
            // Check if relay already exists in stored list after normalization
            if (!currentRelays.some((r) => normalizeUrl(r.url) === normalizedUrl)) {
                const newRelays = [...currentRelays, { url: normalizedUrl, read, write }]
                localStorage.setItem('RELAY_LIST', JSON.stringify(newRelays))
            }

            return true
        } catch (error) {
            console.error('Failed to add relay:', error)
            return false
        }
    },

    // Remove a single relay directly
    removeRelay: (url: string): boolean => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            // Remove from NDK's pool if it exists
            state.ndk.pool.relays.forEach((_, relayUrl) => {
                if (relayUrl === url) {
                    state.ndk?.pool.relays.delete(relayUrl)
                }
            })

            // Update explicitRelayUrls in state
            const updatedUrls = state.explicitRelayUrls.filter((r) => r !== url)
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: updatedUrls }))

            // Update stored relay list in localStorage
            const currentRelays = ndkActions.getRelays()
            const newRelays = currentRelays.filter((r) => r.url !== url)
            localStorage.setItem('RELAY_LIST', JSON.stringify(newRelays))

            return true
        } catch (error) {
            console.error('Failed to remove relay:', error)
            return false
        }
    },

    // Add all default relays at once
    addDefaultRelays: async (): Promise<boolean> => {
        const state = ndkStore.state
        if (!state.ndk) return false

        try {
            // Get current relays to avoid duplicates
            const currentRelays = ndkActions.getRelays()
            let addedCount = 0

            // Add each default relay if not already in the list
            for (const relayUrl of DEFAULT_RELAYS) {
                if (!currentRelays.some((r) => r.url === relayUrl)) {
                    state.ndk.addExplicitRelay(relayUrl)
                    addedCount++
                }
            }

            // Update state with new relays
            const allRelays = [...state.explicitRelayUrls]
            DEFAULT_RELAYS.forEach((url) => {
                if (!allRelays.includes(url)) {
                    allRelays.push(url)
                }
            })
            ndkStore.setState((state) => ({ ...state, explicitRelayUrls: allRelays }))

            // Save to localStorage
            const updatedRelays = [
                ...currentRelays,
                ...DEFAULT_RELAYS.filter((url) => !currentRelays.some((r) => r.url === url)).map((url) => ({
                    url,
                    read: true,
                    write: true,
                })),
            ]
            localStorage.setItem('RELAY_LIST', JSON.stringify(updatedRelays))

            // Reconnect to apply changes if any relays were added
            if (addedCount > 0) {
                await state.ndk.connect()
            }

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
