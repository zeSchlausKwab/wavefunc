import { QueryClient } from '@tanstack/react-query'
import { ndkActions } from '../lib/store/ndk'

/**
 * Default configuration for TanStack Query
 *
 * These settings are optimized for nostr-based applications where:
 * - Data changes frequently via real-time subscriptions
 * - Network calls can be expensive (relay connections)
 * - Offline support is important
 */
export const defaultQueryConfig = {
    queries: {
        // Cache data for 5 minutes by default
        staleTime: 5 * 60 * 1000,

        // Keep data in cache for 10 minutes after component unmount
        gcTime: 10 * 60 * 1000,

        // Retry failed queries up to 3 times with exponential backoff
        retry: (failureCount: number, error: any) => {
            // Don't retry on certain errors
            if (error?.code === 'NETWORK_ERROR' || error?.code === 'NDK_NOT_AVAILABLE') {
                return false
            }
            return failureCount < 3
        },

        // Retry delay with exponential backoff (1s, 2s, 4s)
        retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),

        // Don't refetch on window focus by default (nostr data is real-time)
        refetchOnWindowFocus: false,

        // Don't refetch on reconnect (we handle this via subscriptions)
        refetchOnReconnect: false,

        // Refetch on mount if data is stale
        refetchOnMount: true,

        // Network mode - always try to fetch, even when offline
        networkMode: 'always',
    },

    mutations: {
        // Retry mutations up to 2 times
        retry: 2,

        // Retry delay for mutations
        retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),

        // Network mode for mutations
        networkMode: 'always',
    },
} as const

/**
 * Create a new QueryClient instance with our default configuration
 */
export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: defaultQueryConfig,
    })
}

/**
 * Global query client instance
 *
 * This can be used across the application for cache manipulation
 * and query invalidation outside of React components
 */
export let queryClient: QueryClient

/**
 * Initialize the global query client
 * Should be called once during app initialization
 */
export function initializeQueryClient(): QueryClient {
    if (!queryClient) {
        queryClient = createQueryClient()
    }
    return queryClient
}

/**
 * Get the global query client instance
 * Throws an error if not initialized
 */
export function getQueryClient(): QueryClient {
    if (!queryClient) {
        throw new Error('Query client not initialized. Call initializeQueryClient() first.')
    }
    return queryClient
}

/**
 * Common query options that depend on NDK availability
 */
export const withNDKDependency = <T>(queryFn: () => Promise<T>) => {
    return {
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) {
                throw new Error('NDK not available')
            }
            return queryFn()
        },
        enabled: !!ndkActions.getNDK(),
    }
}

/**
 * Error boundary for query errors
 * Common error types we might encounter
 */
export class QueryError extends Error {
    constructor(
        message: string,
        public code: string,
        public originalError?: any,
    ) {
        super(message)
        this.name = 'QueryError'
    }
}

/**
 * Helper to wrap NDK operations with proper error handling
 */
export async function withQueryErrorHandling<T>(operation: () => Promise<T>, context: string): Promise<T> {
    try {
        return await operation()
    } catch (error: any) {
        console.error(`[Query Error] ${context}:`, error)

        // Classify error types
        if (!ndkActions.getNDK()) {
            throw new QueryError('NDK not available', 'NDK_NOT_AVAILABLE', error)
        }

        if (error?.message?.includes('timeout')) {
            throw new QueryError('Operation timed out', 'TIMEOUT', error)
        }

        if (error?.message?.includes('network')) {
            throw new QueryError('Network error', 'NETWORK_ERROR', error)
        }

        if (error?.message?.includes('relay')) {
            throw new QueryError('Relay error', 'RELAY_ERROR', error)
        }

        // Generic error
        throw new QueryError(error?.message || 'Unknown error occurred', 'UNKNOWN_ERROR', error)
    }
}
