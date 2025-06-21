import { useQuery, useInfiniteQuery, type UseQueryOptions, type UseInfiniteQueryOptions } from '@tanstack/react-query'
import { queryKeys } from './query-keys'
import { withNDKDependency, withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'
import type { Station } from '../types/station'
import { fetchRadioStations, searchRadioStations, parseRadioEventWithSchema } from '../nostr/radio'
import { nip19 } from 'nostr-tools'

/**
 * Hook to fetch a single radio station by naddr
 */
export function useStation(naddr: string, options?: Partial<UseQueryOptions<Station>>) {
    return useQuery({
        queryKey: queryKeys.stations.detail(naddr),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const events = await fetchRadioStations(ndk)

                // Find event by naddr
                const targetEvent = Array.from(events).find((event) => {
                    // Create naddr from event to match
                    const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1]
                    if (dTag) {
                        const eventNaddr = nip19.naddrEncode({
                            kind: event.kind!,
                            pubkey: event.pubkey,
                            identifier: dTag,
                        })
                        return eventNaddr === naddr
                    }
                    return false
                })

                if (!targetEvent) {
                    throw new Error(`Station not found: ${naddr}`)
                }

                const parsed = parseRadioEventWithSchema(targetEvent)
                return {
                    ...parsed,
                    id: targetEvent.id,
                    pubkey: targetEvent.pubkey,
                    imageUrl: parsed.thumbnail || '',
                    created_at: targetEvent.created_at,
                    createdAt: new Date(targetEvent.created_at * 1000),
                    tags: targetEvent.tags as string[][],
                    event: targetEvent,
                } as Station
            }, `fetchStation(${naddr})`)
        }),
        enabled: !!naddr && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    })
}

/**
 * Hook to fetch multiple radio stations with filters
 */
export function useStations(filters: Record<string, any> = {}, options?: Partial<UseQueryOptions<Station[]>>) {
    return useQuery({
        queryKey: queryKeys.stations.list(filters),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                console.log('[useStations] Fetching stations with filters:', filters)

                // Use the existing fetchRadioStations function which has proper filtering
                const events = await fetchRadioStations(ndk)
                console.log('[useStations] Found', events.length, 'station events')

                let stations = events.map((event) => {
                    const parsed = parseRadioEventWithSchema(event)
                    return {
                        ...parsed,
                        id: event.id,
                        pubkey: event.pubkey,
                        imageUrl: parsed.thumbnail || '',
                        created_at: event.created_at,
                        createdAt: new Date(event.created_at * 1000),
                        tags: event.tags as string[][],
                        event,
                        naddr: event.encode(), // Add naddr for consistency
                    } as Station
                })

                // Apply limit if specified
                if (filters.limit && typeof filters.limit === 'number') {
                    stations = stations.slice(0, filters.limit)
                }

                console.log('[useStations] Returning', stations.length, 'valid stations')
                return stations
            }, `fetchStations`)
        }),
        staleTime: 2 * 60 * 1000, // 2 minutes for lists
        ...options,
    })
}

/**
 * Hook for infinite scroll/pagination of radio stations
 */
export function useInfiniteStations(
    filters: Record<string, any> = {},
    options?: Partial<UseInfiniteQueryOptions<Station[], Error, Station[], Station[], readonly unknown[]>>,
) {
    const pageSize = filters.limit || 20

    return useInfiniteQuery({
        queryKey: queryKeys.stations.infinite(filters),
        queryFn: async ({ pageParam }) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const events = await fetchRadioStations(ndk)
                return Array.from(events).map((event) => {
                    const parsed = parseRadioEventWithSchema(event)
                    return {
                        ...parsed,
                        id: event.id,
                        pubkey: event.pubkey,
                        imageUrl: parsed.thumbnail || '',
                        created_at: event.created_at,
                        createdAt: new Date(event.created_at * 1000),
                        tags: event.tags as string[][],
                        event,
                    } as Station
                })
            }, `fetchInfiniteStations`)
        },
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => {
            // Use the oldest event's created_at as the next page cursor
            if (lastPage.length < pageSize) return undefined
            return Math.min(...lastPage.map((station) => station.event?.created_at || 0)).toString()
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
        ...options,
    })
}

/**
 * Hook to search radio stations with debouncing
 */
export function useStationSearch(
    searchTerm: string,
    searchOptions: Record<string, any> = {},
    options?: Partial<UseQueryOptions<Station[]>>,
) {
    return useQuery({
        queryKey: queryKeys.stations.search(searchTerm, searchOptions),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                return await searchRadioStations({
                    searchTerm,
                    ...searchOptions,
                })
            }, `searchStations(${searchTerm})`)
        }),
        enabled: !!searchTerm.trim() && searchTerm.length >= 2 && !!ndkActions.getNDK(),
        staleTime: 30 * 1000, // 30 seconds for search results
        ...options,
    })
}

/**
 * Hook to fetch featured radio stations
 */
export function useFeaturedStations(options?: Partial<UseQueryOptions<Station[]>>) {
    return useQuery({
        queryKey: queryKeys.stations.featured(),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                // Fetch featured stations
                const events = await fetchRadioStations(ndk)
                return Array.from(events)
                    .slice(0, 10)
                    .map((event) => {
                        const parsed = parseRadioEventWithSchema(event)
                        return {
                            ...parsed,
                            id: event.id,
                            pubkey: event.pubkey,
                            imageUrl: parsed.thumbnail || '',
                            created_at: event.created_at,
                            createdAt: new Date(event.created_at * 1000),
                            tags: event.tags as string[][],
                            event,
                        } as Station
                    })
            }, `fetchFeaturedStations`)
        }),
        staleTime: 10 * 60 * 1000, // 10 minutes for featured content
        ...options,
    })
}

/**
 * Hook to fetch stations by owner/creator
 */
export function useStationsByOwner(pubkey: string, options?: Partial<UseQueryOptions<Station[]>>) {
    return useQuery({
        queryKey: queryKeys.stations.byOwner(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const events = await fetchRadioStations(ndk)
                return Array.from(events)
                    .filter((event) => event.pubkey === pubkey)
                    .slice(0, 100)
                    .map((event) => {
                        const parsed = parseRadioEventWithSchema(event)
                        return {
                            ...parsed,
                            id: event.id,
                            pubkey: event.pubkey,
                            imageUrl: parsed.thumbnail || '',
                            created_at: event.created_at,
                            createdAt: new Date(event.created_at * 1000),
                            tags: event.tags as string[][],
                            event,
                        } as Station
                    })
            }, `fetchStationsByOwner(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    })
}

/**
 * Query options factory for common station queries
 * This allows for consistent configuration across the app
 */
export const stationQueries = {
    // Single station query options
    detail: (naddr: string) => ({
        queryKey: queryKeys.stations.detail(naddr),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const events = await fetchRadioStations(ndk)

                // Find event by naddr
                const targetEvent = Array.from(events).find((event) => {
                    const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1]
                    if (dTag) {
                        const eventNaddr = nip19.naddrEncode({
                            kind: event.kind!,
                            pubkey: event.pubkey,
                            identifier: dTag,
                        })
                        return eventNaddr === naddr
                    }
                    return false
                })

                if (!targetEvent) {
                    throw new Error(`Station not found: ${naddr}`)
                }

                const parsed = parseRadioEventWithSchema(targetEvent)
                return {
                    ...parsed,
                    id: targetEvent.id,
                    pubkey: targetEvent.pubkey,
                    imageUrl: parsed.thumbnail || '',
                    created_at: targetEvent.created_at,
                    createdAt: new Date(targetEvent.created_at * 1000),
                    tags: targetEvent.tags as string[][],
                    event: targetEvent,
                } as Station
            }, `fetchStation(${naddr})`)
        }),
        enabled: !!naddr && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000,
    }),

    // Station list query options
    list: (filters: Record<string, any> = {}) => ({
        queryKey: queryKeys.stations.list(filters),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const events = await fetchRadioStations(ndk)
                return Array.from(events).map((event) => {
                    const parsed = parseRadioEventWithSchema(event)
                    return {
                        ...parsed,
                        id: event.id,
                        pubkey: event.pubkey,
                        imageUrl: parsed.thumbnail || '',
                        created_at: event.created_at,
                        createdAt: new Date(event.created_at * 1000),
                        tags: event.tags as string[][],
                        event,
                    } as Station
                })
            }, `fetchStations`)
        }),
        staleTime: 2 * 60 * 1000,
    }),

    // Search query options
    search: (searchTerm: string, searchOptions: Record<string, any> = {}) => ({
        queryKey: queryKeys.stations.search(searchTerm, searchOptions),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                return await searchRadioStations({
                    searchTerm,
                    ...searchOptions,
                })
            }, `searchStations(${searchTerm})`)
        }),
        enabled: !!searchTerm.trim() && searchTerm.length >= 2 && !!ndkActions.getNDK(),
        staleTime: 30 * 1000,
    }),
} as const
