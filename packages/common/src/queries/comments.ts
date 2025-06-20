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
import { createCommentEvent } from '../nostr/comments'
import { type NostrComment as Comment } from '../types/comment'
import { NDKEvent } from '@nostr-dev-kit/ndk'

interface CreateCommentInput {
    content: string
    stationEvent: NDKEvent
    parentComment?: NDKEvent
    eventId?: string
    stationNaddr?: string
    replyTo?: string
}

interface CommentMutationContext {
    optimisticComment: Comment
    previousValues: Map<any, any>
    queryKeysToUpdate: any[]
}

/**
 * Hook to fetch comments for a specific event/station
 */
export function useComments(eventId: string, options?: Partial<UseQueryOptions<Comment[]>>) {
    return useQuery({
        queryKey: queryKeys.comments.byEvent(eventId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Fetch existing comments
                const events = await ndk.fetchEvents({
                    kinds: [1], // Comment events
                    '#e': [eventId], // References the target event
                    limit: 100,
                })

                // Convert events to comment objects
                const comments: Comment[] = Array.from(events).map((event) => ({
                    id: event.id,
                    content: event.content,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    rootId: eventId,
                    parentId: event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1],
                }))

                // Sort by creation time (oldest first for thread-like display)
                return comments.sort((a, b) => a.created_at - b.created_at)
            }, `fetchComments(${eventId})`)
        }),
        enabled: !!eventId && !!ndkActions.getNDK(),
        staleTime: 30 * 1000, // 30 seconds - comments change frequently
        ...options,
    })
}

/**
 * Hook to fetch comments for a specific station by naddr
 */
export function useStationComments(naddr: string, options?: Partial<UseQueryOptions<Comment[]>>) {
    return useQuery({
        queryKey: queryKeys.comments.byStation(naddr),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Fetch comments that reference the station
                const events = await ndk.fetchEvents({
                    kinds: [1], // Comment events
                    '#a': [naddr], // References the station by naddr
                    limit: 100,
                })

                const comments: Comment[] = Array.from(events).map((event) => ({
                    id: event.id,
                    content: event.content,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    rootId: naddr,
                    parentId: event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1],
                    event,
                }))

                return comments.sort((a, b) => a.created_at - b.created_at)
            }, `fetchStationComments(${naddr})`)
        }),
        enabled: !!naddr && !!ndkActions.getNDK(),
        staleTime: 30 * 1000, // 30 seconds
        ...options,
    })
}

/**
 * Hook to fetch a comment thread (replies to a comment)
 */
export function useCommentThread(rootCommentId: string, options?: Partial<UseQueryOptions<Comment[]>>) {
    return useQuery({
        queryKey: queryKeys.comments.thread(rootCommentId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Fetch all replies to the root comment
                const events = await ndk.fetchEvents({
                    kinds: [1],
                    '#e': [rootCommentId],
                    limit: 50,
                })

                const comments: Comment[] = Array.from(events)
                    .filter((event) => {
                        // Make sure this is actually a reply (has the reply marker)
                        return event.tags.some(
                            (tag) => tag[0] === 'e' && tag[1] === rootCommentId && tag[3] === 'reply',
                        )
                    })
                    .map((event) => ({
                        id: event.id,
                        content: event.content,
                        pubkey: event.pubkey,
                        created_at: event.created_at,
                        parentId: rootCommentId,
                        event,
                    }))

                return comments.sort((a, b) => a.created_at - b.created_at)
            }, `fetchCommentThread(${rootCommentId})`)
        }),
        enabled: !!rootCommentId && !!ndkActions.getNDK(),
        staleTime: 30 * 1000,
        ...options,
    })
}

/**
 * Mutation hook for creating a new comment
 */
export function useCreateComment(options?: Partial<UseMutationOptions<Comment, Error, CreateCommentInput, CommentMutationContext>>) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (commentData: CreateCommentInput) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                // Create and publish comment event
                const commentEvent = createCommentEvent(
                    commentData.content,
                    commentData.stationEvent,
                    commentData.parentComment,
                )
                commentEvent.ndk = ndk
                await commentEvent.sign()
                await commentEvent.publish()

                // Return as Comment type
                return {
                    id: commentEvent.id!,
                    content: commentEvent.content,
                    pubkey: commentEvent.pubkey,
                    created_at: commentEvent.created_at!,
                    rootId: commentData.eventId,
                    parentId: commentData.replyTo,
                } as Comment
            }, 'createComment')
        },

        onMutate: async (commentData: CreateCommentInput) => {
            // Create optimistic comment
            const optimisticComment: Comment = {
                id: `temp-${Date.now()}`,
                content: commentData.content,
                pubkey: ndkActions.getNDK()?.activeUser?.pubkey || '',
                created_at: Math.floor(Date.now() / 1000),
                rootId: commentData.eventId || commentData.stationNaddr,
                parentId: commentData.replyTo,
            }

            // Determine which query keys to update
            const queryKeysToUpdate: any[] = []

            if (commentData.eventId) {
                queryKeysToUpdate.push(queryKeys.comments.byEvent(commentData.eventId))
            }

            if (commentData.stationNaddr) {
                queryKeysToUpdate.push(queryKeys.comments.byStation(commentData.stationNaddr))
            }

            if (commentData.replyTo) {
                queryKeysToUpdate.push(queryKeys.comments.thread(commentData.replyTo))
            }

            // Cancel outgoing refetches and snapshot previous values
            const previousValues = new Map()

            for (const queryKey of queryKeysToUpdate) {
                await queryClient.cancelQueries({ queryKey })
                const previous = queryClient.getQueryData<Comment[]>(queryKey)
                previousValues.set(queryKey, previous)

                // Optimistically add the comment
                queryClient.setQueryData<Comment[]>(queryKey, (old) => {
                    return old ? [...old, optimisticComment] : [optimisticComment]
                })
            }

            return { optimisticComment, previousValues, queryKeysToUpdate }
        },

        onError: (err, commentData, context) => {
            // Roll back optimistic updates
            if (context?.previousValues && context?.queryKeysToUpdate) {
                for (const queryKey of context.queryKeysToUpdate) {
                    const previous = context.previousValues.get(queryKey)
                    if (previous !== undefined) {
                        queryClient.setQueryData(queryKey, previous)
                    }
                }
            }
        },

        onSuccess: (newComment, commentData, context) => {
            // Replace optimistic comment with real one
            if (context?.queryKeysToUpdate) {
                for (const queryKey of context.queryKeysToUpdate) {
                    queryClient.setQueryData<Comment[]>(queryKey, (old) => {
                        if (!old) return [newComment]

                        return old.map((comment) =>
                            comment.id === context.optimisticComment?.id ? newComment : comment,
                        )
                    })
                }
            }
        },

        onSettled: (data, error, commentData) => {
            // Invalidate related queries
            if (commentData.eventId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.comments.byEvent(commentData.eventId) })
            }

            if (commentData.stationNaddr) {
                queryClient.invalidateQueries({ queryKey: queryKeys.comments.byStation(commentData.stationNaddr) })
            }

            if (commentData.replyTo) {
                queryClient.invalidateQueries({ queryKey: queryKeys.comments.thread(commentData.replyTo) })
            }
        },

        ...options,
    })
}

/**
 * Query options factory for comment queries
 */
export const commentQueries = {
    // Comments by event ID
    byEvent: (eventId: string) => ({
        queryKey: queryKeys.comments.byEvent(eventId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                const events = await ndk.fetchEvents({
                    kinds: [1],
                    '#e': [eventId],
                    limit: 100,
                })

                const comments: Comment[] = Array.from(events).map((event) => ({
                    id: event.id,
                    content: event.content,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    rootId: eventId,
                    parentId: event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1],
                    event,
                }))

                return comments.sort((a, b) => a.created_at - b.created_at)
            }, `fetchComments(${eventId})`)
        }),
        enabled: !!eventId && !!ndkActions.getNDK(),
        staleTime: 30 * 1000,
    }),

    // Comments by station naddr
    byStation: (naddr: string) => ({
        queryKey: queryKeys.comments.byStation(naddr),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                const events = await ndk.fetchEvents({
                    kinds: [1],
                    '#a': [naddr],
                    limit: 100,
                })

                const comments: Comment[] = Array.from(events).map((event) => ({
                    id: event.id,
                    content: event.content,
                    pubkey: event.pubkey,
                    created_at: event.created_at,
                    rootId: naddr,
                    parentId: event.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1],
                    event,
                }))

                return comments.sort((a, b) => a.created_at - b.created_at)
            }, `fetchStationComments(${naddr})`)
        }),
        enabled: !!naddr && !!ndkActions.getNDK(),
        staleTime: 30 * 1000,
    }),

    // Comment thread
    thread: (rootCommentId: string) => ({
        queryKey: queryKeys.comments.thread(rootCommentId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                const events = await ndk.fetchEvents({
                    kinds: [1],
                    '#e': [rootCommentId],
                    limit: 50,
                })

                const comments: Comment[] = Array.from(events)
                    .filter((event) => {
                        return event.tags.some(
                            (tag) => tag[0] === 'e' && tag[1] === rootCommentId && tag[3] === 'reply',
                        )
                    })
                    .map((event) => ({
                        id: event.id,
                        content: event.content,
                        pubkey: event.pubkey,
                        created_at: event.created_at,
                        parentId: rootCommentId,
                        event,
                    }))

                return comments.sort((a, b) => a.created_at - b.created_at)
            }, `fetchCommentThread(${rootCommentId})`)
        }),
        enabled: !!rootCommentId && !!ndkActions.getNDK(),
        staleTime: 30 * 1000,
    }),
} as const
