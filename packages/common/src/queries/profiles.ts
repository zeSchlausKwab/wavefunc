import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { queryKeys } from './query-keys'
import { withNDKDependency, withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'
import type { NDKUserProfile } from '@nostr-dev-kit/ndk'
import { fetchProfileByPubkey } from '../nostr/profile'

/**
 * Hook to fetch a single user profile by pubkey
 */
export function useProfile(pubkey: string, options?: Partial<UseQueryOptions<NDKUserProfile | null>>) {
    return useQuery({
        queryKey: queryKeys.profiles.detail(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                return fetchProfileByPubkey(ndk, pubkey)
            }, `fetchProfile(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 10 * 60 * 1000, // 10 minutes - profiles don't change often
        ...options,
    })
}

/**
 * Hook to fetch multiple profiles by pubkeys
 */
export function useProfiles(
    pubkeys: string[],
    options?: Partial<UseQueryOptions<Record<string, NDKUserProfile | null>>>,
) {
    // Sort pubkeys for consistent cache keys
    const sortedPubkeys = [...pubkeys].sort()

    return useQuery({
        queryKey: queryKeys.profiles.list(sortedPubkeys),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                // Fetch profiles individually since fetchProfiles doesn't exist
                const profilePromises = sortedPubkeys.map(async (pubkey) => {
                    const profile = await fetchProfileByPubkey(ndk, pubkey)
                    return { pubkey, profile }
                })

                const results = await Promise.all(profilePromises)
                const profiles: Record<string, NDKUserProfile | null> = {}

                results.forEach(({ pubkey, profile }) => {
                    profiles[pubkey] = profile
                })

                return profiles
            }, `fetchProfiles`)
        }),
        enabled: pubkeys.length > 0 && !!ndkActions.getNDK(),
        staleTime: 10 * 60 * 1000, // 10 minutes
        ...options,
    })
}

/**
 * Hook to fetch user metadata (kind 0 event)
 */
export function useProfileMetadata(pubkey: string, options?: Partial<UseQueryOptions<any>>) {
    return useQuery({
        queryKey: queryKeys.profiles.metadata(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const event = await ndk.fetchEvent({
                    kinds: [0],
                    authors: [pubkey],
                })

                if (!event) return null

                try {
                    return JSON.parse(event.content)
                } catch {
                    return null
                }
            }, `fetchProfileMetadata(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 15 * 60 * 1000, // 15 minutes - metadata changes less frequently
        ...options,
    })
}

/**
 * Hook to fetch user relay list (kind 10002 event)
 */
export function useProfileRelays(
    pubkey: string,
    options?: Partial<UseQueryOptions<Record<string, { read: boolean; write: boolean }> | null>>,
) {
    return useQuery({
        queryKey: queryKeys.profiles.relays(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const event = await ndk.fetchEvent({
                    kinds: [10002],
                    authors: [pubkey],
                })

                if (!event) return null

                // Parse relay list from tags
                const relays: Record<string, { read: boolean; write: boolean }> = {}

                for (const tag of event.tags) {
                    if (tag[0] === 'r' && tag[1]) {
                        const url = tag[1]
                        const mode = tag[2]

                        if (!relays[url]) {
                            relays[url] = { read: false, write: false }
                        }

                        if (!mode || mode === 'read') {
                            relays[url].read = true
                        }
                        if (!mode || mode === 'write') {
                            relays[url].write = true
                        }
                    }
                }

                return relays
            }, `fetchProfileRelays(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 30 * 60 * 1000, // 30 minutes - relay lists change infrequently
        ...options,
    })
}

/**
 * Query options factory for profile queries
 */
export const profileQueries = {
    // Single profile query options
    detail: (pubkey: string) => ({
        queryKey: queryKeys.profiles.detail(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                return fetchProfileByPubkey(ndk, pubkey)
            }, `fetchProfile(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 10 * 60 * 1000,
    }),

    // Multiple profiles query options
    list: (pubkeys: string[]) => {
        const sortedPubkeys = [...pubkeys].sort()
        return {
            queryKey: queryKeys.profiles.list(sortedPubkeys),
            ...withNDKDependency(async () => {
                return withQueryErrorHandling(async () => {
                    const ndk = ndkActions.getNDK()!
                    // Fetch profiles individually since fetchProfiles doesn't exist
                    const profilePromises = sortedPubkeys.map(async (pubkey) => {
                        const profile = await fetchProfileByPubkey(ndk, pubkey)
                        return { pubkey, profile }
                    })

                    const results = await Promise.all(profilePromises)
                    const profiles: Record<string, NDKUserProfile | null> = {}

                    results.forEach(({ pubkey, profile }) => {
                        profiles[pubkey] = profile
                    })

                    return profiles
                }, `fetchProfiles`)
            }),
            enabled: pubkeys.length > 0 && !!ndkActions.getNDK(),
            staleTime: 10 * 60 * 1000,
        }
    },

    // Metadata query options
    metadata: (pubkey: string) => ({
        queryKey: queryKeys.profiles.metadata(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const event = await ndk.fetchEvent({
                    kinds: [0],
                    authors: [pubkey],
                })

                if (!event) return null

                try {
                    return JSON.parse(event.content)
                } catch {
                    return null
                }
            }, `fetchProfileMetadata(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 15 * 60 * 1000,
    }),

    // Relays query options
    relays: (pubkey: string) => ({
        queryKey: queryKeys.profiles.relays(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const event = await ndk.fetchEvent({
                    kinds: [10002],
                    authors: [pubkey],
                })

                if (!event) return null

                const relays: Record<string, { read: boolean; write: boolean }> = {}

                for (const tag of event.tags) {
                    if (tag[0] === 'r' && tag[1]) {
                        const url = tag[1]
                        const mode = tag[2]

                        if (!relays[url]) {
                            relays[url] = { read: false, write: false }
                        }

                        if (!mode || mode === 'read') {
                            relays[url].read = true
                        }
                        if (!mode || mode === 'write') {
                            relays[url].write = true
                        }
                    }
                }

                return relays
            }, `fetchProfileRelays(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 30 * 60 * 1000,
    }),
} as const
