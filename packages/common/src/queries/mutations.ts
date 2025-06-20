import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'
import { queryKeys } from './query-keys'
import { withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'
import type { Station } from '../types/station'
import { publishStation, updateStation } from '../nostr/publish'
import type { NostrEvent } from '@nostr-dev-kit/ndk'
import { parseRadioEventWithSchema } from '../nostr/radio'

// Helper function to convert NDKEvent to Station
function convertEventToStation(event: {
    id: string
    pubkey: string
    created_at: number
    tags: string[][]
    content: string
}): Station {
    try {
        const parsed = parseRadioEventWithSchema(event as any)
        return {
            id: event.id,
            naddr: undefined,
            name: parsed.name,
            description: parsed.description,
            website: parsed.website,
            imageUrl: parsed.thumbnail || '',
            countryCode: parsed.countryCode,
            languageCodes: parsed.languageCodes,
            pubkey: event.pubkey,
            tags: event.tags,
            streams: parsed.streams || [],
            streamingServerUrl: parsed.streamingServerUrl,
            created_at: event.created_at,
        }
    } catch {
        // Fallback if parsing fails
        return {
            id: event.id,
            name: event.tags.find((tag) => tag[0] === 'name')?.[1] || '',
            description: '',
            website: '',
            imageUrl: '',
            pubkey: event.pubkey,
            tags: event.tags,
            streams: [],
            created_at: event.created_at,
        }
    }
}

interface StationMutationContext {
    optimisticStation: Station
    previousStations?: Station[]
}

interface UpdateStationInput {
    station: Station
    updatedData: {
        name: string
        description: string
        website: string
        streams: any[]
        thumbnail?: string
        countryCode?: string
        languageCodes?: string[]
        tags?: string[]
        location?: string
    }
}

interface UpdateStationMutationContext {
    previousStation?: Station
    naddr: string
}

interface DeleteStationMutationContext {
    previousStation?: Station
    naddr: string
}

/**
 * Mutation hook for publishing a new radio station
 */
export function usePublishStation(
    options?: Partial<UseMutationOptions<Station, Error, NostrEvent, StationMutationContext>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (stationData: NostrEvent) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const event = await publishStation(ndk, stationData)
                // Convert NDKEvent to Station using proper conversion
                return convertEventToStation({
                    id: event.id!,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    tags: event.tags as string[][],
                    content: event.content,
                })
            }, 'publishStation')
        },

        onMutate: async (stationData: NostrEvent): Promise<StationMutationContext> => {
            // Create optimistic station object
            const optimisticStation: Station = {
                id: `temp-${Date.now()}`,
                name: stationData.tags.find((tag) => tag[0] === 'name')?.[1] || '',
                description: '',
                website: '',
                imageUrl: '',
                pubkey: stationData.pubkey,
                tags: stationData.tags as string[][],
                streams: [],
                created_at: Math.floor(Date.now() / 1000),
            }

            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.stations.all })

            // Snapshot the previous value
            const previousStations = queryClient.getQueryData<Station[]>(queryKeys.stations.lists())

            // Optimistically update to the new value
            queryClient.setQueryData<Station[]>(queryKeys.stations.lists(), (old) => {
                return old ? [optimisticStation, ...old] : [optimisticStation]
            })

            return { optimisticStation, previousStations }
        },

        onError: (err, stationData, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousStations) {
                queryClient.setQueryData(queryKeys.stations.lists(), context.previousStations)
            }
        },

        onSuccess: (newStation, stationData, context) => {
            // Update the cache with the real station data
            queryClient.setQueryData<Station[]>(queryKeys.stations.lists(), (old) => {
                if (!old) return [newStation]

                // Replace the optimistic station with the real one
                return old.map((station) => (station.id === context?.optimisticStation?.id ? newStation : station))
            })

            // Add the new station to individual cache if we have an naddr
            if (newStation.naddr) {
                queryClient.setQueryData(queryKeys.stations.detail(newStation.naddr), newStation)
            }

            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: queryKeys.stations.byOwner(newStation.pubkey || '') })
        },

        onSettled: () => {
            // Always refetch stations after error or success
            queryClient.invalidateQueries({ queryKey: queryKeys.stations.lists() })
        },

        ...options,
    })
}

/**
 * Mutation hook for updating an existing radio station
 */
export function useUpdateStation(
    options?: Partial<UseMutationOptions<Station, Error, UpdateStationInput, UpdateStationMutationContext>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ station, updatedData }: UpdateStationInput) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const event = await updateStation(ndk, station, updatedData)
                // Convert NDKEvent to Station
                return convertEventToStation({
                    id: event.id!,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    tags: event.tags as string[][],
                    content: event.content,
                })
            }, 'updateStation')
        },

        onMutate: async ({ station, updatedData }: UpdateStationInput): Promise<UpdateStationMutationContext> => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.stations.detail(station.naddr!) })

            // Snapshot the previous value
            const previousStation = queryClient.getQueryData<Station>(queryKeys.stations.detail(station.naddr!))

            // Optimistically update the station
            if (previousStation) {
                const optimisticStation: Station = {
                    ...previousStation,
                    name: updatedData.name,
                    description: updatedData.description,
                    website: updatedData.website,
                    streams: updatedData.streams,
                    imageUrl: updatedData.thumbnail || previousStation.imageUrl,
                    countryCode: updatedData.countryCode || previousStation.countryCode,
                    languageCodes: updatedData.languageCodes || previousStation.languageCodes,
                    tags: updatedData.tags ? updatedData.tags.map((tag) => [tag]) : previousStation.tags,
                    created_at: Math.floor(Date.now() / 1000),
                }

                queryClient.setQueryData(queryKeys.stations.detail(station.naddr!), optimisticStation)

                // Also update in any lists that contain this station
                queryClient.setQueriesData<Station[]>({ queryKey: queryKeys.stations.lists() }, (old) => {
                    if (!old) return old
                    return old.map((s) => (s.naddr === station.naddr ? optimisticStation : s))
                })
            }

            return { previousStation, naddr: station.naddr! }
        },

        onError: (err, variables, context) => {
            // If the mutation fails, use the context to roll back
            if (context?.previousStation && context?.naddr) {
                queryClient.setQueryData(queryKeys.stations.detail(context.naddr), context.previousStation)

                // Roll back list updates too
                queryClient.setQueriesData<Station[]>({ queryKey: queryKeys.stations.lists() }, (old) => {
                    if (!old) return old
                    return old.map((station) => (station.naddr === context.naddr ? context.previousStation! : station))
                })
            }
        },

        onSuccess: (updatedStation, variables) => {
            // Update the cache with the real updated station data
            queryClient.setQueryData(queryKeys.stations.detail(variables.station.naddr!), updatedStation)

            // Update in any lists that contain this station
            queryClient.setQueriesData<Station[]>({ queryKey: queryKeys.stations.lists() }, (old) => {
                if (!old) return old
                return old.map((station) => (station.naddr === variables.station.naddr ? updatedStation : station))
            })

            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: queryKeys.stations.byOwner(updatedStation.pubkey || '') })
        },

        onSettled: (data, error, variables) => {
            // Always refetch the specific station after error or success
            queryClient.invalidateQueries({ queryKey: queryKeys.stations.detail(variables.station.naddr!) })
        },

        ...options,
    })
}

/**
 * Mutation hook for deleting a radio station
 */
export function useDeleteStation(
    options?: Partial<UseMutationOptions<void, Error, string, DeleteStationMutationContext>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (naddr: string) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                // TODO: Implement deleteStation function in publish.ts
                // This would involve publishing a deletion event (kind 5)
                throw new Error('Delete station not implemented yet')
            }, 'deleteStation')
        },

        onMutate: async (naddr: string): Promise<DeleteStationMutationContext> => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.stations.detail(naddr) })

            // Snapshot the previous station
            const previousStation = queryClient.getQueryData<Station>(queryKeys.stations.detail(naddr))

            // Remove from cache optimistically
            queryClient.removeQueries({ queryKey: queryKeys.stations.detail(naddr) })

            // Remove from any lists
            queryClient.setQueriesData<Station[]>({ queryKey: queryKeys.stations.lists() }, (old) => {
                if (!old) return old
                return old.filter((station) => station.naddr !== naddr)
            })

            return { previousStation, naddr }
        },

        onError: (err, naddr, context) => {
            // If the mutation fails, restore the station
            if (context?.previousStation) {
                queryClient.setQueryData(queryKeys.stations.detail(naddr), context.previousStation)

                // Add back to lists
                queryClient.setQueriesData<Station[]>({ queryKey: queryKeys.stations.lists() }, (old) => {
                    if (!old) return [context.previousStation!]
                    return [context.previousStation!, ...old]
                })
            }
        },

        onSettled: () => {
            // Refetch all station lists
            queryClient.invalidateQueries({ queryKey: queryKeys.stations.lists() })
        },

        ...options,
    })
}

/**
 * Mutation options factory for common station mutations
 */
export const stationMutations = {
    publish: (options?: Partial<UseMutationOptions<Station, Error, NostrEvent>>) => ({
        mutationFn: async (stationData: NostrEvent) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const event = await publishStation(ndk, stationData)
                return convertEventToStation({
                    id: event.id!,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    tags: event.tags as string[][],
                    content: event.content,
                })
            }, 'publishStation')
        },
        ...options,
    }),

    update: (options?: Partial<UseMutationOptions<Station, Error, UpdateStationInput>>) => ({
        mutationFn: async ({ station, updatedData }: UpdateStationInput) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const event = await updateStation(ndk, station, updatedData)
                return convertEventToStation({
                    id: event.id!,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    tags: event.tags as string[][],
                    content: event.content,
                })
            }, 'updateStation')
        },
        ...options,
    }),
} as const
