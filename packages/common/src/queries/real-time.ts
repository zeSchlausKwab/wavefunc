import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import { queryKeys } from './query-keys'
import { ndkActions } from '../lib/store/ndk'
import { mapNostrEventToStation } from '../nostr/radio'
import type { Station } from '../types/station'
import type { NostrComment as Comment } from '../types/comment'

/**
 * Hook to enable real-time updates for radio stations
 *
 * Subscribes to station events and automatically updates TanStack Query cache
 */
export function useRealtimeStations() {
    const queryClient = useQueryClient()

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        console.log('[Realtime] Setting up station subscription')

        // Subscribe to radio station events (kind 30311)
        const sub = ndk.subscribe({
            kinds: [30311 as NDKKind],
            limit: 0, // Get all new events from now on
        })

        sub.on('event', (event: NDKEvent) => {
            try {
                console.log('[Realtime] Received station event:', event.id)

                // Convert event to station object
                const station = mapNostrEventToStation(event)
                if (!station) return

                // Update individual station cache if we have an naddr
                if (station.naddr) {
                    queryClient.setQueryData(queryKeys.stations.detail(station.naddr), station)
                }

                // Update all station lists that might contain this station
                queryClient.setQueriesData<Station[]>({ queryKey: queryKeys.stations.lists() }, (oldData) => {
                    if (!oldData) return oldData

                    // Check if station already exists in the list
                    const existingIndex = oldData.findIndex((s) => s.naddr === station.naddr || s.id === station.id)

                    if (existingIndex >= 0) {
                        // Update existing station
                        const newData = [...oldData]
                        newData[existingIndex] = station
                        return newData
                    } else {
                        // Add new station to the beginning
                        return [station, ...oldData]
                    }
                })

                // Update infinite query data
                queryClient.setQueriesData({ queryKey: queryKeys.stations.infinite() }, (oldData: any) => {
                    if (!oldData?.pages) return oldData

                    // Update the first page with new station
                    const newPages = [...oldData.pages]
                    if (newPages[0]) {
                        const existingIndex = newPages[0].findIndex(
                            (s: Station) => s.naddr === station.naddr || s.id === station.id,
                        )

                        if (existingIndex >= 0) {
                            newPages[0][existingIndex] = station
                        } else {
                            newPages[0] = [station, ...newPages[0]]
                        }
                    }

                    return {
                        ...oldData,
                        pages: newPages,
                    }
                })

                // Update station owner queries
                if (station.pubkey) {
                    queryClient.setQueryData<Station[]>(queryKeys.stations.byOwner(station.pubkey), (oldData) => {
                        if (!oldData) return [station]

                        const existingIndex = oldData.findIndex((s) => s.naddr === station.naddr || s.id === station.id)

                        if (existingIndex >= 0) {
                            const newData = [...oldData]
                            newData[existingIndex] = station
                            return newData
                        } else {
                            return [station, ...oldData]
                        }
                    })
                }
            } catch (error) {
                console.error('[Realtime] Error processing station event:', error)
            }
        })

        sub.on('eose', () => {
            console.log('[Realtime] Station subscription end of stored events')
        })

        return () => {
            console.log('[Realtime] Cleaning up station subscription')
            sub.stop()
        }
    }, [queryClient])
}

/**
 * Hook to enable real-time updates for comments
 */
export function useRealtimeComments() {
    const queryClient = useQueryClient()

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        console.log('[Realtime] Setting up comment subscription')

        // Subscribe to comment events (kind 1 with #e or #a tags)
        const sub = ndk.subscribe({
            kinds: [1 as NDKKind],
            limit: 0, // Get all new events from now on
        })

        sub.on('event', (event: NDKEvent) => {
            try {
                // Check if this is a comment (has #e or #a reference)
                const referencedEvent = event.tags.find((tag) => tag[0] === 'e')?.[1]
                const referencedStation = event.tags.find((tag) => tag[0] === 'a')?.[1]

                if (!referencedEvent && !referencedStation) return

                console.log('[Realtime] Received comment event:', event.id)

                // Create comment object
                const comment: Comment = {
                    id: event.id,
                    content: event.content,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    rootId: referencedEvent,
                    parentId: event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1],
                }

                // Update comment queries
                if (referencedEvent) {
                    queryClient.setQueryData<Comment[]>(queryKeys.comments.byEvent(referencedEvent), (oldData) => {
                        if (!oldData) return [comment]

                        // Check if comment already exists
                        const exists = oldData.some((c) => c.id === comment.id)
                        if (exists) return oldData

                        // Add new comment and sort by creation time
                        return [...oldData, comment].sort((a, b) => a.created_at - b.created_at)
                    })
                }

                if (referencedStation) {
                    queryClient.setQueryData<Comment[]>(queryKeys.comments.byStation(referencedStation), (oldData) => {
                        if (!oldData) return [comment]

                        const exists = oldData.some((c) => c.id === comment.id)
                        if (exists) return oldData

                        return [...oldData, comment].sort((a, b) => a.created_at - b.created_at)
                    })
                }

                // Update thread queries if this is a reply
                if (comment.parentId) {
                    queryClient.setQueryData<Comment[]>(queryKeys.comments.thread(comment.parentId), (oldData) => {
                        if (!oldData) return [comment]

                        const exists = oldData.some((c) => c.id === comment.id)
                        if (exists) return oldData

                        return [...oldData, comment].sort((a, b) => a.created_at - b.created_at)
                    })
                }
            } catch (error) {
                console.error('[Realtime] Error processing comment event:', error)
            }
        })

        return () => {
            console.log('[Realtime] Cleaning up comment subscription')
            sub.stop()
        }
    }, [queryClient])
}

/**
 * Hook to enable real-time updates for reactions
 */
export function useRealtimeReactions() {
    const queryClient = useQueryClient()

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        console.log('[Realtime] Setting up reaction subscription')

        // Subscribe to reaction events (kind 7)
        const sub = ndk.subscribe({
            kinds: [7 as NDKKind],
            limit: 0,
        })

        sub.on('event', (event: NDKEvent) => {
            try {
                // Get the referenced event
                const referencedEvent = event.tags.find((tag) => tag[0] === 'e')?.[1]
                const referencedStation = event.tags.find((tag) => tag[0] === 'a')?.[1]

                if (!referencedEvent && !referencedStation) return

                console.log('[Realtime] Received reaction event:', event.id)

                // Invalidate reaction queries to trigger refetch
                if (referencedEvent) {
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.reactions.byEvent(referencedEvent),
                    })
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.reactions.summary(referencedEvent),
                    })
                }

                if (referencedStation) {
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.reactions.byStation(referencedStation),
                    })
                }
            } catch (error) {
                console.error('[Realtime] Error processing reaction event:', error)
            }
        })

        return () => {
            console.log('[Realtime] Cleaning up reaction subscription')
            sub.stop()
        }
    }, [queryClient])
}

/**
 * Hook to enable real-time updates for user profiles
 */
export function useRealtimeProfiles() {
    const queryClient = useQueryClient()

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        console.log('[Realtime] Setting up profile subscription')

        // Subscribe to profile metadata events (kind 0)
        const sub = ndk.subscribe({
            kinds: [0 as NDKKind],
            limit: 0,
        })

        sub.on('event', (event: NDKEvent) => {
            try {
                console.log('[Realtime] Received profile event:', event.pubkey)

                // Invalidate all profile-related queries for this pubkey
                queryClient.invalidateQueries({
                    queryKey: queryKeys.profiles.detail(event.pubkey),
                })
                queryClient.invalidateQueries({
                    queryKey: queryKeys.profiles.metadata(event.pubkey),
                })

                // Also invalidate any multi-profile queries that might include this user
                queryClient.invalidateQueries({
                    queryKey: queryKeys.profiles.lists(),
                })
            } catch (error) {
                console.error('[Realtime] Error processing profile event:', error)
            }
        })

        return () => {
            console.log('[Realtime] Cleaning up profile subscription')
            sub.stop()
        }
    }, [queryClient])
}

/**
 * Hook to enable real-time updates for favorites lists
 */
export function useRealtimeFavorites() {
    const queryClient = useQueryClient()

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        console.log('[Realtime] Setting up favorites subscription')

        // Subscribe to favorites list events (kind 30001 for bookmarks/favorites)
        const sub = ndk.subscribe({
            kinds: [30001 as NDKKind],
            limit: 0,
        })

        sub.on('event', (event: NDKEvent) => {
            try {
                console.log('[Realtime] Received favorites event:', event.id)

                // Invalidate favorites queries for this user
                queryClient.invalidateQueries({
                    queryKey: queryKeys.favorites.byUser(event.pubkey),
                })

                // If we can determine the list ID, invalidate specific list queries
                const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1]
                if (dTag) {
                    const listId = `${event.kind}:${event.pubkey}:${dTag}`
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.favorites.list(listId),
                    })
                    queryClient.invalidateQueries({
                        queryKey: queryKeys.favorites.stations(listId),
                    })
                }
            } catch (error) {
                console.error('[Realtime] Error processing favorites event:', error)
            }
        })

        return () => {
            console.log('[Realtime] Cleaning up favorites subscription')
            sub.stop()
        }
    }, [queryClient])
}

/**
 * Master hook that enables all real-time updates
 *
 * Use this in your app root to enable real-time synchronization
 * across all TanStack Query caches
 */
export function useRealtimeSync() {
    useRealtimeStations()
    useRealtimeComments()
    useRealtimeReactions()
    useRealtimeProfiles()
    useRealtimeFavorites()
}

/**
 * Utility to manually trigger cache invalidation for specific data types
 */
export function useInvalidateQueries() {
    const queryClient = useQueryClient()

    return {
        // Invalidate all station-related queries
        invalidateStations: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.stations.all })
        },

        // Invalidate all profile-related queries
        invalidateProfiles: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
        },

        // Invalidate all comment-related queries
        invalidateComments: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.comments.all })
        },

        // Invalidate all favorites-related queries
        invalidateFavorites: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all })
        },

        // Invalidate everything
        invalidateAll: () => {
            queryClient.invalidateQueries()
        },

        // Clear all caches
        clearAll: () => {
            queryClient.clear()
        },
    }
}
