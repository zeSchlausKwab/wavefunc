import type NDK from '@nostr-dev-kit/ndk'
import { NDKEvent, type NDKFilter, type NDKSubscription } from '@nostr-dev-kit/ndk'
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import { COMMENT_KIND } from '../types/comment'
import { RADIO_EVENT_KINDS } from './radio'

/**
 * Create a comment for a station
 * @param content The comment text
 * @param stationEvent The station event being commented on
 * @param parentComment Optional parent comment if this is a reply
 * @returns Unsigned NDKEvent
 */
export function createCommentEvent(content: string, stationEvent: NDKEvent, parentComment?: NDKEvent): NDKEvent {
    const tags: string[][] = []

    // Root event references use uppercase tags (E, K, P)
    tags.push(['E', stationEvent.id])
    tags.push(['K', RADIO_EVENT_KINDS.STREAM.toString()])
    tags.push(['P', stationEvent.pubkey])

    if (parentComment) {
        // Reply to comment - add parent reference with lowercase tags (e, k, p)
        tags.push(['e', parentComment.id])
        tags.push(['k', COMMENT_KIND.toString()])
        tags.push(['p', parentComment.pubkey])
    } else {
        // Root comment - add station as both root and parent
        tags.push(['e', stationEvent.id])
        tags.push(['k', RADIO_EVENT_KINDS.STREAM.toString()])
        tags.push(['p', stationEvent.pubkey])
    }

    tags.push(['client', 'nostr_radio'])

    return new NDKEvent(undefined, {
        kind: COMMENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        content,
        tags,
        pubkey: '',
    })
}

/**
 * Publish a comment
 * @param ndk NDK instance
 * @param commentEvent Comment event to publish
 * @returns Promise<NDKEvent>
 */
export async function publishComment(ndk: NDK, commentEvent: NDKEvent): Promise<NDKEvent> {
    commentEvent.ndk = ndk
    await commentEvent.sign()
    await commentEvent.publish()
    return commentEvent
}

/**
 * Subscribe to ALL comments for a specific station
 * @param ndk NDK instance
 * @param stationId Station event ID
 * @param onComment Callback for each comment
 * @returns NDKSubscription
 */
export function subscribeToStationComments(
    ndk: NDK,
    stationId: string,
    onComment?: (comment: NDKEvent) => void,
): NDKSubscription {
    const filter: NDKFilter = {
        kinds: [COMMENT_KIND],
        '#E': [stationId],
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.PARALLEL,
    })

    if (onComment) {
        subscription.on('event', (event: NDKEvent) => {
            try {
                onComment(event)
            } catch (e) {
                // Silent fail
            }
        })
    }

    return subscription
}

/**
 * Subscribe ONLY to root comments for a station
 * @param ndk NDK instance
 * @param stationId Station event ID
 * @param onComment Callback for each comment
 * @returns NDKSubscription
 */
export function subscribeToRootComments(
    ndk: NDK,
    stationId: string,
    onComment?: (comment: NDKEvent) => void,
): NDKSubscription {
    const filter: NDKFilter = {
        kinds: [COMMENT_KIND],
        '#E': [stationId],
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.PARALLEL,
    })

    if (onComment) {
        const processedIds = new Set<string>()

        subscription.on('event', (event: NDKEvent) => {
            try {
                // Skip if already processed
                if (processedIds.has(event.id)) return

                // Check if this is a reply to another comment
                const eTag = event.tags.find((tag) => tag[0] === 'e')
                const kTag = event.tags.find((tag) => tag[0] === 'k')
                const isReplyToComment = eTag && kTag && kTag[1] === COMMENT_KIND.toString()

                // Only process if it's not a reply to another comment
                if (!isReplyToComment) {
                    processedIds.add(event.id)
                    onComment(event)
                }
            } catch (e) {
                // Silent fail
            }
        })
    }

    return subscription
}

/**
 * Subscribe ONLY to replies to a specific comment
 * @param ndk NDK instance
 * @param commentId Comment ID to watch for replies
 * @param stationId Station ID to ensure replies belong to the right station
 * @param onReply Callback for each reply
 * @returns NDKSubscription
 */
export function subscribeToCommentReplies(
    ndk: NDK,
    commentId: string,
    stationId: string,
    onReply?: (reply: NDKEvent) => void,
): NDKSubscription {
    if (!commentId || !stationId) return { stop: () => {} } as NDKSubscription

    const filter: NDKFilter = {
        kinds: [COMMENT_KIND],
        '#e': [commentId],
        '#E': [stationId],
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.PARALLEL,
    })

    if (onReply) {
        const processedIds = new Set<string>()

        subscription.on('event', (event: NDKEvent) => {
            try {
                // Skip if already processed or invalid
                if (processedIds.has(event.id) || !event.id) return

                const eTag = event.tags.find((tag) => tag[0] === 'e')
                const kTag = event.tags.find((tag) => tag[0] === 'k')
                const ETag = event.tags.find((tag) => tag[0] === 'E')

                const isDirectReply =
                    eTag &&
                    eTag[1] === commentId &&
                    kTag &&
                    kTag[1] === COMMENT_KIND.toString() &&
                    ETag &&
                    ETag[1] === stationId

                if (isDirectReply) {
                    processedIds.add(event.id)
                    onReply(event)
                }
            } catch (e) {
                // Silent fail
            }
        })
    }

    return subscription
}

/**
 * Fetch all comments for a station
 * @param ndk NDK instance
 * @param stationId Station event ID
 * @returns Promise<NDKEvent[]>
 */
export async function fetchStationComments(ndk: NDK, stationId: string): Promise<NDKEvent[]> {
    const filter: NDKFilter = {
        kinds: [COMMENT_KIND],
        '#E': [stationId],
    }

    try {
        const events = await ndk.fetchEvents(filter)
        return Array.from(events)
    } catch {
        return []
    }
}

/**
 * Fetch ONLY replies to a specific comment
 * @param ndk NDK instance
 * @param commentId Comment ID to fetch replies for
 * @param stationId Station ID to ensure replies belong to the right station
 * @returns Promise<NDKEvent[]>
 */
export async function fetchCommentReplies(ndk: NDK, commentId: string, stationId: string): Promise<NDKEvent[]> {
    if (!commentId || !stationId) return []

    const filter: NDKFilter = {
        kinds: [COMMENT_KIND],
        '#e': [commentId],
        '#E': [stationId],
    }

    try {
        // Create a timeout promise
        const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) => {
            setTimeout(() => reject(new Error('Fetch timeout')), 3000)
        })

        // Get all direct replies with timeout
        const events = await Promise.race([ndk.fetchEvents(filter), timeoutPromise])

        // Filter out invalid events and deduplicate
        const validEvents = new Map<string, NDKEvent>()
        Array.from(events).forEach((event) => {
            if (event.id && validEvents.has(event.id) === false) {
                validEvents.set(event.id, event)
            }
        })

        // Create a map to handle duplicates
        const replyMap = new Map<string, NDKEvent>()

        // Process events with strict checks
        validEvents.forEach((event) => {
            try {
                const eTag = event.tags.find((tag) => tag[0] === 'e')
                const kTag = event.tags.find((tag) => tag[0] === 'k')
                const ETag = event.tags.find((tag) => tag[0] === 'E')

                const isDirectReply =
                    eTag &&
                    eTag[1] === commentId &&
                    kTag &&
                    kTag[1] === COMMENT_KIND.toString() &&
                    ETag &&
                    ETag[1] === stationId

                if (isDirectReply) {
                    replyMap.set(event.id, event)
                }
            } catch {
                // Silent fail
            }
        })

        // Convert map to array and sort by timestamp (newest first)
        return Array.from(replyMap.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    } catch {
        return []
    }
}

/**
 * Fetch ONLY root comments for a station
 * @param ndk NDK instance
 * @param stationId Station event ID
 * @returns Promise<NDKEvent[]>
 */
export async function fetchRootComments(ndk: NDK, stationId: string): Promise<NDKEvent[]> {
    if (!stationId) return []

    try {
        const filter: NDKFilter = {
            kinds: [COMMENT_KIND],
            '#E': [stationId],
        }

        // Create a timeout promise
        const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) => {
            setTimeout(() => reject(new Error('Fetch timeout')), 5000)
        })

        // Get all comments with timeout
        const events = await Promise.race([ndk.fetchEvents(filter), timeoutPromise])

        // Filter out invalid events and deduplicate
        const validEvents = new Map<string, NDKEvent>()
        const replyIds = new Set<string>()

        // First pass - identify all events and mark replies
        Array.from(events).forEach((event) => {
            if (!event.id) return

            validEvents.set(event.id, event)

            // Identify comments that are replies to other comments
            const eTag = event.tags.find((tag) => tag[0] === 'e')
            const kTag = event.tags.find((tag) => tag[0] === 'k')

            if (eTag && kTag && kTag[1] === COMMENT_KIND.toString()) {
                replyIds.add(event.id)
            }
        })

        // Second pass - extract only root comments
        const commentMap = new Map<string, NDKEvent>()

        validEvents.forEach((event) => {
            // Skip if this is a known reply
            if (replyIds.has(event.id)) return

            try {
                const ETag = event.tags.find((tag) => tag[0] === 'E')

                if (ETag && ETag[1] === stationId) {
                    commentMap.set(event.id, event)
                }
            } catch {
                // Silent fail
            }
        })

        // Convert to array and sort by timestamp (newest first)
        return Array.from(commentMap.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
    } catch {
        return []
    }
}
