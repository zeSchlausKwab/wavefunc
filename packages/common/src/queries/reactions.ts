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
import { NDKEvent, NDKKind, type NDKFilter } from '@nostr-dev-kit/ndk'

interface Reaction {
    id: string
    content: string
    pubkey: string
    created_at: number
    eventId: string
    event: NDKEvent
}

interface PublishReactionInput {
    event: NDKEvent
    content: string
}

/**
 * Hook to fetch reactions for an event
 */
export function useReactions(eventId: string, options?: Partial<UseQueryOptions<Reaction[]>>) {
    return useQuery({
        queryKey: queryKeys.reactions.list(eventId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                const filter: NDKFilter = {
                    kinds: [NDKKind.Reaction],
                    '#e': [eventId],
                }

                // Create a timeout promise
                const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) => {
                    setTimeout(() => reject(new Error('Fetch timeout')), 3000)
                })

                // Get all reactions with timeout
                const events = await Promise.race([ndk.fetchEvents(filter), timeoutPromise])

                // Filter out invalid events and deduplicate
                const validEvents = new Map<string, NDKEvent>()

                for (const event of events) {
                    if (event.pubkey && event.created_at && event.id) {
                        // Use pubkey+content as key to deduplicate
                        const key = `${event.pubkey}-${event.content}`
                        const existing = validEvents.get(key)

                        if (!existing || event.created_at > existing.created_at) {
                            validEvents.set(key, event)
                        }
                    }
                }

                const reactions: Reaction[] = Array.from(validEvents.values()).map((event) => ({
                    id: event.id,
                    content: event.content,
                    pubkey: event.pubkey,
                    created_at: event.created_at || 0,
                    eventId,
                    event,
                }))

                return reactions.sort((a, b) => b.created_at - a.created_at)
            }, `fetchReactions(${eventId})`)
        }),
        enabled: !!eventId && !!ndkActions.getNDK(),
        staleTime: 30 * 1000, // 30 seconds
        ...options,
    })
}

/**
 * Hook to publish a reaction to an event
 */
export function usePublishReaction(options?: Partial<UseMutationOptions<NDKEvent, Error, PublishReactionInput>>) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ event, content }: PublishReactionInput) => {
            return withQueryErrorHandling(async () => {
                return await event.react(content, true)
            }, 'publishReaction')
        },
        onSuccess: (publishedEvent, { event }) => {
            // Invalidate reactions query for this event
            queryClient.invalidateQueries({
                queryKey: queryKeys.reactions.list(event.id),
            })
        },
        ...options,
    })
}

/**
 * Hook to get reaction summary for an event
 */
export function useReactionSummary(
    eventId: string,
    options?: Partial<UseQueryOptions<{ total: number; byContent: Record<string, number> }>>,
) {
    return useQuery({
        queryKey: queryKeys.reactions.summary(eventId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                const filter: NDKFilter = {
                    kinds: [NDKKind.Reaction],
                    '#e': [eventId],
                }

                const events = await ndk.fetchEvents(filter)

                const contentCounts: Record<string, number> = {}
                let total = 0

                for (const event of events) {
                    if (event.content) {
                        contentCounts[event.content] = (contentCounts[event.content] || 0) + 1
                        total++
                    }
                }

                return {
                    total,
                    byContent: contentCounts,
                }
            }, `fetchReactionSummary(${eventId})`)
        }),
        enabled: !!eventId && !!ndkActions.getNDK(),
        staleTime: 30 * 1000, // 30 seconds
        ...options,
    })
}
