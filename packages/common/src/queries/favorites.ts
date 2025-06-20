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
import {
    fetchFavoritesLists,
    publishFavoritesList,
    addStationToFavorites,
    removeStationFromFavorites,
    type FavoritesList,
} from '../nostr/favorites'

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
                return lists.find(list => list.id === listId) || null
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
                const list = lists.find(l => l.id === listId)

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
                    favorites: [...favoritesList.favorites, {
                        event_id: station.id!,
                        name: station.name,
                        added_at: Math.floor(Date.now() / 1000),
                        naddr: station.naddr,
                        pubkey: station.pubkey,
                    }],
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
                    favorites: favoritesList.favorites.filter(fav => fav.event_id !== stationId),
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
                return lists.find(l => l.id === listId) || null
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
                const list = lists.find(l => l.id === listId)

                if (!list || !list.favorites?.length) {
                    return []
                }

                // Return the station references for now
                // Convert favorites to stations (this would need actual implementation)
                return [] as Station[]
            }, `fetchFavoritesListStations(${listId})`)
        }),
        enabled: !!listId && !!ndkActions.getNDK(),
        staleTime: 3 * 60 * 1000,
    }),
} as const
