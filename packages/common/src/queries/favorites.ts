import {
    useQuery,
    useMutation,
    useQueryClient,
    type UseQueryOptions,
    type UseMutationOptions,
} from '@tanstack/react-query'
import { queryKeys } from './query-keys'
import { withNDKDependency, withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'
import type { Station } from '../types/station'
import { parseRadioEventWithSchema } from '../nostr/radio'
import {
    fetchFavoritesLists,
    publishFavoritesList,
    addStationToFavorites,
    removeStationFromFavorites,
    type FavoritesList,
} from '../nostr/favorites'
import { RADIO_EVENT_KINDS } from '../schemas/events'

interface CreateFavoritesListInput {
    name: string
    description?: string
    isPrivate?: boolean
}

interface AddToFavoritesInput {
    listId: string
    station: Station
}

interface RemoveFromFavoritesInput {
    listId: string
    stationId: string
}

interface FavoritesMutationContext {
    previousList?: FavoritesList
    previousStations?: Station[]
}

/**
 * Hook to fetch user's favorites lists
 */
export function useFavoritesLists(pubkey: string, options?: Partial<UseQueryOptions<FavoritesList[]>>) {
    return useQuery({
        queryKey: queryKeys.favorites.byUser(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                return fetchFavoritesLists(ndk, { pubkey })
            }, `fetchFavoritesLists(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    })
}

/**
 * Hook to fetch a specific favorites list with its stations
 */
export function useFavoritesList(listId: string, options?: Partial<UseQueryOptions<FavoritesList | null>>) {
    return useQuery({
        queryKey: queryKeys.favorites.list(listId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const lists = await fetchFavoritesLists(ndk)
                return lists.find((list) => list.id === listId) || null
            }, `fetchFavoritesList(${listId})`)
        }),
        enabled: !!listId && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    })
}

/**
 * Hook to fetch stations from a favorites list
 */
export function useFavoritesListStations(listId: string, options?: Partial<UseQueryOptions<Station[]>>) {
    return useQuery({
        queryKey: queryKeys.favorites.stations(listId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // First get the favorites list
                const lists = await fetchFavoritesLists(ndk)
                const list = lists.find((l) => l.id === listId)

                if (!list || !list.favorites?.length) {
                    return []
                }

                // Then fetch the actual station data
                // This assumes stations are referenced by naddr in the favorites list
                const stationPromises = list.favorites.map(async (stationRef): Promise<Station> => {
                    // Convert FavoriteStation to Station format
                    // This is a basic conversion - in practice you'd want to fetch full station data
                    return {
                        id: stationRef.event_id,
                        name: stationRef.name,
                        description: '',
                        website: '',
                        imageUrl: '',
                        streams: [],
                        tags: [],
                        pubkey: stationRef.pubkey || '',
                        created_at: stationRef.added_at,
                        naddr: stationRef.naddr,
                    }
                })

                return Promise.all(stationPromises)
            }, `fetchFavoritesListStations(${listId})`)
        }),
        enabled: !!listId && !!ndkActions.getNDK(),
        staleTime: 3 * 60 * 1000, // 3 minutes
        ...options,
    })
}

/**
 * Mutation hook for creating a new favorites list
 */
export function useCreateFavoritesList(
    options?: Partial<UseMutationOptions<FavoritesList, Error, CreateFavoritesListInput>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ name, description }: CreateFavoritesListInput) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const event = await publishFavoritesList(ndk, { name, description: description || '' })
                // Convert NDKEvent to FavoritesList
                return {
                    id: event.id!,
                    name,
                    description: description || '',
                    favorites: [],
                    created_at: event.created_at!,
                    pubkey: event.pubkey,
                    tags: event.tags as string[][],
                } as FavoritesList
            }, 'createFavoritesList')
        },

        onSuccess: (newList) => {
            // Invalidate user's favorites lists
            if (newList.pubkey) {
                queryClient.invalidateQueries({ queryKey: queryKeys.favorites.byUser(newList.pubkey) })
            }

            // Add to cache
            queryClient.setQueryData(queryKeys.favorites.list(newList.id), newList)
        },

        ...options,
    })
}

/**
 * Mutation hook for adding a station to a favorites list
 */
export function useAddToFavoritesList(
    options?: Partial<UseMutationOptions<FavoritesList, Error, AddToFavoritesInput, FavoritesMutationContext>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ listId, station }: AddToFavoritesInput) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                // Find the favorites list first
                const lists = await fetchFavoritesLists(ndk, { pubkey: ndk.activeUser?.pubkey })
                const favoritesList = lists.find((list) => list.id === listId)
                if (!favoritesList) {
                    throw new Error('Favorites list not found')
                }
                const event = await addStationToFavorites(ndk, favoritesList, station)
                // Convert result back to FavoritesList
                return {
                    ...favoritesList,
                    favorites: [
                        ...favoritesList.favorites,
                        {
                            event_id: station.id!,
                            name: station.name,
                            added_at: Math.floor(Date.now() / 1000),
                            naddr: station.naddr,
                            pubkey: station.pubkey,
                        },
                    ],
                } as FavoritesList
            }, 'addToFavoritesList')
        },

        onMutate: async ({ listId, station }: AddToFavoritesInput) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.favorites.list(listId) })
            await queryClient.cancelQueries({ queryKey: queryKeys.favorites.stations(listId) })

            // Snapshot the previous values
            const previousList = queryClient.getQueryData<FavoritesList>(queryKeys.favorites.list(listId))
            const previousStations = queryClient.getQueryData<Station[]>(queryKeys.favorites.stations(listId))

            // Optimistically update
            if (previousList) {
                const optimisticList = {
                    ...previousList,
                    favorites: [
                        ...(previousList.favorites || []),
                        { event_id: station.id!, name: station.name, added_at: Math.floor(Date.now() / 1000) },
                    ],
                }
                queryClient.setQueryData(queryKeys.favorites.list(listId), optimisticList)
            }

            if (previousStations) {
                queryClient.setQueryData(queryKeys.favorites.stations(listId), [...previousStations, station])
            }

            return { previousList, previousStations }
        },

        onError: (err, { listId }, context) => {
            // Roll back optimistic updates
            if (context?.previousList) {
                queryClient.setQueryData(queryKeys.favorites.list(listId), context.previousList)
            }
            if (context?.previousStations) {
                queryClient.setQueryData(queryKeys.favorites.stations(listId), context.previousStations)
            }
        },

        onSuccess: (updatedList, { listId }) => {
            // Update cache with real data
            queryClient.setQueryData(queryKeys.favorites.list(listId), updatedList)

            // Invalidate stations query to refetch
            queryClient.invalidateQueries({ queryKey: queryKeys.favorites.stations(listId) })

            // Invalidate user's lists
            if (updatedList.pubkey) {
                queryClient.invalidateQueries({ queryKey: queryKeys.favorites.byUser(updatedList.pubkey) })
            }
        },

        ...options,
    })
}

/**
 * Mutation hook for removing a station from a favorites list
 */
export function useRemoveFromFavoritesList(
    options?: Partial<UseMutationOptions<FavoritesList, Error, RemoveFromFavoritesInput, FavoritesMutationContext>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ listId, stationId }: RemoveFromFavoritesInput) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                // Find the favorites list first
                const lists = await fetchFavoritesLists(ndk, { pubkey: ndk.activeUser?.pubkey })
                const favoritesList = lists.find((list) => list.id === listId)
                if (!favoritesList) {
                    throw new Error('Favorites list not found')
                }
                const event = await removeStationFromFavorites(ndk, favoritesList, stationId)
                // Return updated favorites list
                return {
                    ...favoritesList,
                    favorites: favoritesList.favorites.filter((fav) => fav.event_id !== stationId),
                } as FavoritesList
            }, 'removeFromFavoritesList')
        },

        onMutate: async ({ listId, stationId }: RemoveFromFavoritesInput) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.favorites.list(listId) })
            await queryClient.cancelQueries({ queryKey: queryKeys.favorites.stations(listId) })

            // Snapshot the previous values
            const previousList = queryClient.getQueryData<FavoritesList>(queryKeys.favorites.list(listId))
            const previousStations = queryClient.getQueryData<Station[]>(queryKeys.favorites.stations(listId))

            // Optimistically update
            if (previousList?.favorites) {
                const optimisticList = {
                    ...previousList,
                    favorites: previousList.favorites.filter(
                        (fav) => fav.event_id !== stationId && fav.naddr !== stationId,
                    ),
                }
                queryClient.setQueryData(queryKeys.favorites.list(listId), optimisticList)
            }

            if (previousStations) {
                const optimisticStations = previousStations.filter(
                    (station) => station.id !== stationId && station.naddr !== stationId,
                )
                queryClient.setQueryData(queryKeys.favorites.stations(listId), optimisticStations)
            }

            return { previousList, previousStations }
        },

        onError: (err, { listId }, context) => {
            // Roll back optimistic updates
            if (context?.previousList) {
                queryClient.setQueryData(queryKeys.favorites.list(listId), context.previousList)
            }
            if (context?.previousStations) {
                queryClient.setQueryData(queryKeys.favorites.stations(listId), context.previousStations)
            }
        },

        onSuccess: (updatedList, { listId }) => {
            // Update cache with real data
            queryClient.setQueryData(queryKeys.favorites.list(listId), updatedList)

            // Invalidate stations query to refetch
            queryClient.invalidateQueries({ queryKey: queryKeys.favorites.stations(listId) })

            // Invalidate user's lists
            if (updatedList.pubkey) {
                queryClient.invalidateQueries({ queryKey: queryKeys.favorites.byUser(updatedList.pubkey) })
            }
        },

        ...options,
    })
}

/**
 * Query options factory for favorites queries
 */
export const favoritesQueries = {
    // User's favorites lists
    byUser: (pubkey: string) => ({
        queryKey: queryKeys.favorites.byUser(pubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                return fetchFavoritesLists(ndk, { pubkey })
            }, `fetchFavoritesLists(${pubkey})`)
        }),
        enabled: !!pubkey && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000,
    }),

    // Single favorites list
    list: (listId: string) => ({
        queryKey: queryKeys.favorites.list(listId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!
                const lists = await fetchFavoritesLists(ndk)
                return lists.find((l) => l.id === listId) || null
            }, `fetchFavoritesList(${listId})`)
        }),
        enabled: !!listId && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000,
    }),

    // Stations in favorites list
    stations: (listId: string) => ({
        queryKey: queryKeys.favorites.stations(listId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                const lists = await fetchFavoritesLists(ndk)
                const list = lists.find((l) => l.id === listId)

                if (!list || !list.favorites?.length) {
                    return []
                }

                // Resolve each favorite to a Station object
                const resolvedStations: Station[] = []

                for (const favorite of list.favorites) {
                    // Skip invalid favorites
                    if (!favorite.event_id) {
                        console.warn('Skipping invalid favorite:', favorite)
                        continue
                    }

                    try {
                        let event = null

                        // Try to fetch by naddr first (more specific)
                        if (favorite.naddr) {
                            try {
                                const parts = favorite.naddr.split(':')
                                if (parts.length >= 3 && parts[0] === String(RADIO_EVENT_KINDS.STREAM)) {
                                    const [kind, pubkey, identifier] = parts

                                    const filter = {
                                        kinds: [Number(kind)],
                                        authors: [pubkey],
                                        '#d': [identifier],
                                    }

                                    const events = await ndk.fetchEvents(filter)
                                    const foundEvent = Array.from(events)[0]

                                    if (foundEvent) {
                                        event = foundEvent
                                    }
                                } else if (favorite.naddr.startsWith('naddr')) {
                                    event = await ndk.fetchEvent(favorite.naddr)
                                } else {
                                    event = await ndk.fetchEvent(favorite.naddr)
                                }
                            } catch (error) {
                                console.error(`Failed to fetch by naddr (${favorite.naddr}):`, error)
                            }
                        }

                        // Fallback to event_id if naddr didn't work
                        if (!event && favorite.event_id && !favorite.event_id.startsWith('naddr')) {
                            try {
                                event = await ndk.fetchEvent(favorite.event_id)
                            } catch (error) {
                                console.error(`Failed to fetch by event_id (${favorite.event_id}):`, error)
                            }
                        }

                        if (event) {
                            try {
                                const parsedStation = parseRadioEventWithSchema(event)

                                // Create the Station object
                                const station: Station = {
                                    id: favorite.event_id,
                                    naddr: favorite.naddr,
                                    name: parsedStation.name,
                                    description: parsedStation.description,
                                    website: parsedStation.website,
                                    streams: parsedStation.streams,
                                    tags: parsedStation.eventTags || event.tags,
                                    imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                                    countryCode: parsedStation.countryCode,
                                    languageCodes: parsedStation.languageCodes,
                                    pubkey: event.pubkey,
                                    created_at: event.created_at || Math.floor(Date.now() / 1000),
                                    event,
                                }

                                resolvedStations.push(station)
                            } catch (parseError) {
                                console.error(`Error parsing station data for ${favorite.event_id}:`, parseError)
                                // Skip this station but continue with others
                            }
                        } else {
                            console.warn(`No event found for station ${favorite.event_id}`)
                            // Skip this station but continue with others
                        }
                    } catch (fetchError) {
                        console.error(`Error fetching station ${favorite.event_id}:`, fetchError)
                        // Skip this station but continue with others
                    }
                }

                return resolvedStations
            }, `fetchFavoritesListStations(${listId})`)
        }),
        enabled: !!listId && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes - stations don't change often
    }),
} as const

/**
 * Hook to get resolved stations for all user's favorites lists
 */
export function useResolvedFavoriteStations(
    userPubkey: string,
    options?: Partial<UseQueryOptions<Record<string, Station[]>>>,
) {
    return useQuery({
        queryKey: queryKeys.favorites.resolved(userPubkey),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Get all the user's favorites lists
                const favoritesLists = await fetchFavoritesLists(ndk, { pubkey: userPubkey })

                if (favoritesLists.length === 0) {
                    return {}
                }

                // Resolve stations for each list
                const resolvedStationsByList: Record<string, Station[]> = {}

                for (const list of favoritesLists) {
                    if (!list.favorites || list.favorites.length === 0) {
                        resolvedStationsByList[list.id] = []
                        continue
                    }

                    const resolvedStations: Station[] = []

                    for (const favorite of list.favorites) {
                        // Skip invalid favorites
                        if (!favorite.event_id) {
                            console.warn('Skipping invalid favorite:', favorite)
                            continue
                        }

                        try {
                            let event = null

                            // Try to fetch by naddr first (more specific)
                            if (favorite.naddr) {
                                try {
                                    const parts = favorite.naddr.split(':')
                                    if (parts.length >= 3 && parts[0] === String(RADIO_EVENT_KINDS.STREAM)) {
                                        const [kind, pubkey, identifier] = parts

                                        const filter = {
                                            kinds: [Number(kind)],
                                            authors: [pubkey],
                                            '#d': [identifier],
                                        }

                                        const events = await ndk.fetchEvents(filter)
                                        const foundEvent = Array.from(events)[0]

                                        if (foundEvent) {
                                            event = foundEvent
                                        }
                                    } else if (favorite.naddr.startsWith('naddr')) {
                                        event = await ndk.fetchEvent(favorite.naddr)
                                    } else {
                                        event = await ndk.fetchEvent(favorite.naddr)
                                    }
                                } catch (error) {
                                    console.error(`Failed to fetch by naddr (${favorite.naddr}):`, error)
                                }
                            }

                            // Fallback to event_id if naddr didn't work
                            if (!event && favorite.event_id && !favorite.event_id.startsWith('naddr')) {
                                try {
                                    event = await ndk.fetchEvent(favorite.event_id)
                                } catch (error) {
                                    console.error(`Failed to fetch by event_id (${favorite.event_id}):`, error)
                                }
                            }

                            if (event) {
                                try {
                                    const parsedStation = parseRadioEventWithSchema(event)

                                    // Create the Station object
                                    const station: Station = {
                                        id: favorite.event_id,
                                        naddr: favorite.naddr,
                                        name: parsedStation.name,
                                        description: parsedStation.description,
                                        website: parsedStation.website,
                                        streams: parsedStation.streams,
                                        tags: parsedStation.eventTags || event.tags,
                                        imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                                        countryCode: parsedStation.countryCode,
                                        languageCodes: parsedStation.languageCodes,
                                        pubkey: event.pubkey,
                                        created_at: event.created_at || Math.floor(Date.now() / 1000),
                                        event,
                                    }

                                    resolvedStations.push(station)
                                } catch (parseError) {
                                    console.error(`Error parsing station data for ${favorite.event_id}:`, parseError)
                                    // Skip this station but continue with others
                                }
                            } else {
                                console.warn(`No event found for station ${favorite.event_id}`)
                                // Skip this station but continue with others
                            }
                        } catch (fetchError) {
                            console.error(`Error fetching station ${favorite.event_id}:`, fetchError)
                            // Skip this station but continue with others
                        }
                    }

                    resolvedStationsByList[list.id] = resolvedStations
                }

                return resolvedStationsByList
            }, `fetchResolvedFavoriteStations(${userPubkey})`)
        }),
        enabled: !!userPubkey && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes - stations don't change often
        ...options,
    })
}
