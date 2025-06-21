import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { queryKeys } from './query-keys'
import { withNDKDependency, withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'

interface ShoutboxMessages {
    rootPosts: NDKEvent[]
    allReplyEvents: NDKEvent[]
}

const MAX_REPLY_FETCH_DEPTH = 5 // Max depth for fetching nested replies
const REPLIES_FETCH_LIMIT_PER_DEPTH = 50 // Max replies to fetch per parent set per depth

/**
 * Hook to fetch all shoutbox messages (root posts and their replies)
 */
export function useShoutboxMessages(options?: Partial<UseQueryOptions<ShoutboxMessages>>) {
    return useQuery({
        queryKey: queryKeys.shoutbox.messages(),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Step 1: Fetch Kind 1 root posts
                const rootPostsFilter = {
                    kinds: [NDKKind.Text],
                    '#t': ['wavefunc', 'shoutbox'],
                    limit: 50,
                }
                const fetchedRootEvents = await ndk.fetchEvents(rootPostsFilter)
                let rootPosts = Array.from(fetchedRootEvents.values()).filter((event) => {
                    if (event.kind !== NDKKind.Text) return false
                    const eTags = event.tags.filter((tag) => tag[0].toLowerCase() === 'e')
                    const isNip10Reply = eTags.some(
                        (tag) => tag.length >= 4 && (tag[3] === 'reply' || tag[3] === 'root'),
                    )
                    return !isNip10Reply
                })
                rootPosts.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))

                // Step 2: Iteratively fetch Kind 1111 replies
                const allFetchedReplies: NDKEvent[] = []
                let parentEventIdsToFetchRepliesFor = rootPosts.map((event) => event.id)
                const fetchedReplyIds = new Set<string>()

                for (let depth = 0; depth < MAX_REPLY_FETCH_DEPTH; depth++) {
                    if (parentEventIdsToFetchRepliesFor.length === 0) break

                    const repliesFilter = {
                        kinds: [1111],
                        '#e': parentEventIdsToFetchRepliesFor,
                        limit: parentEventIdsToFetchRepliesFor.length * REPLIES_FETCH_LIMIT_PER_DEPTH,
                    }
                    const newRepliesCollection = await ndk.fetchEvents(repliesFilter)
                    const newRepliesArray = Array.from(newRepliesCollection.values())

                    const trulyNewReplies: NDKEvent[] = []
                    for (const reply of newRepliesArray) {
                        if (!fetchedReplyIds.has(reply.id)) {
                            trulyNewReplies.push(reply)
                            allFetchedReplies.push(reply)
                            fetchedReplyIds.add(reply.id)
                        }
                    }

                    if (trulyNewReplies.length === 0) break
                    parentEventIdsToFetchRepliesFor = trulyNewReplies.map((event) => event.id)
                }

                return { rootPosts, allReplyEvents: allFetchedReplies }
            }, 'fetchShoutboxMessages')
        }),
        enabled: !!ndkActions.getNDK(),
        staleTime: 2 * 60 * 1000, // 2 minutes
        refetchInterval: 5 * 60 * 1000, // 5 minutes
        ...options,
    })
}

/**
 * Hook to fetch replies to a specific shoutbox post
 */
export function useShoutboxReplies(parentEventId: string, options?: Partial<UseQueryOptions<NDKEvent[]>>) {
    return useQuery({
        queryKey: queryKeys.shoutbox.replies(parentEventId),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Fetch Kind 1111 replies to this specific parent event
                const repliesFilter = {
                    kinds: [1111],
                    '#e': [parentEventId],
                    limit: 100,
                }
                const fetchedReplies = await ndk.fetchEvents(repliesFilter)
                const repliesArray = Array.from(fetchedReplies).sort(
                    (a, b) => (a.created_at || 0) - (b.created_at || 0),
                )

                return repliesArray
            }, `fetchShoutboxReplies(${parentEventId})`)
        }),
        enabled: !!parentEventId && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...options,
    })
}
