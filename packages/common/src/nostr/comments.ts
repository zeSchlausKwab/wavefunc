import type { NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'
import NDK, { NDKEvent, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import { RADIO_EVENT_KINDS } from '../schemas/events'
import { COMMENT_KIND } from '../types/comment'

/**
 * Create a comment for a station
 * @param content The comment text
 * @param stationEvent The station event being commented on
 * @param parentComment Optional parent comment if this is a reply
 * @returns Unsigned NDKEvent
 */
export function createCommentEvent(content: string, stationEvent: NDKEvent, parentComment?: NDKEvent): NDKEvent {
    const tags: string[][] = []

    // Always add both uppercase and lowercase tags for maximum compatibility

    // Add uppercase station references
    tags.push(['E', stationEvent.id])
    tags.push(['K', RADIO_EVENT_KINDS.STREAM.toString()])
    tags.push(['P', stationEvent.pubkey])

    // Add lowercase station references
    tags.push(['e', stationEvent.id])
    tags.push(['k', RADIO_EVENT_KINDS.STREAM.toString()])
    tags.push(['p', stationEvent.pubkey])

    if (parentComment) {
        // If it's a reply to another comment, add parent comment references
        tags.push(['e', parentComment.id])
        tags.push(['k', COMMENT_KIND.toString()])
        tags.push(['p', parentComment.pubkey])
    }

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
 * Fetch all comments for a station
 * @param ndk NDK instance
 * @param stationId Station event ID
 * @returns Promise<NDKEvent[]>
 */
export async function fetchStationComments(ndk: NDK, stationId: string): Promise<NDKEvent[]> {
    if (!stationId) return []

    try {
        const filter: NDKFilter = {
            kinds: [COMMENT_KIND],
            '#E': [stationId],
        }

        const events = await ndk.fetchEvents(filter)
        return Array.from(events)
    } catch (error) {
        console.error('Error fetching comments:', error)
        return []
    }
}

/**
 * Subscribe to comments for a station
 * @param ndk NDK instance
 * @param stationId Station event ID
 * @param onComment Callback for new comments
 * @returns NDKSubscription
 */
export function subscribeToComments(
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
        // Simple deduplication
        const processedIds = new Set<string>()

        subscription.on('event', (event: NDKEvent) => {
            try {
                if (!event.id || processedIds.has(event.id)) return
                processedIds.add(event.id)
                onComment(event)
            } catch (e) {
                console.error('Error processing comment event:', e)
            }
        })
    }

    return subscription
}

/**
 * Check if a comment is a reply to another comment
 * @param comment The comment to check
 * @param parentCommentId Optional specific parent to check for
 * @returns boolean
 */
export function isReplyToComment(comment: NDKEvent, parentCommentId?: string): boolean {
    // Looking for a pattern where we have e-tag with a comment ID and k-tag with COMMENT_KIND
    // The key is to identify which e-tag refers to the parent comment (not the station)

    // First, look for k-tags with COMMENT_KIND (1111)
    const commentKindTags = comment.tags.filter(
        (tag) => tag[0].toLowerCase() === 'k' && tag[1] === COMMENT_KIND.toString(),
    )

    if (commentKindTags.length === 0) {
        // No k-tag with comment kind, so this is not a reply
        return false
    }

    // Now find e-tags that might reference a comment
    for (const tag of comment.tags) {
        if (tag[0].toLowerCase() === 'e') {
            // If we're looking for a specific parent
            if (parentCommentId && tag[1] === parentCommentId) {
                return true
            }

            // Skip the station reference (usually has a corresponding K tag with 31237)
            const isStationReference = comment.tags.some(
                (t) => t[0].toLowerCase() === 'k' && t[1] === '31237' && t[0].toLowerCase() === 'e',
            )

            if (!isStationReference) {
                // This is likely a reference to a comment
                // If we weren't looking for a specific parent, any non-station e-tag means this is a reply
                if (!parentCommentId) {
                    return true
                }
            }
        }
    }

    return false
}

/**
 * Get the parent comment ID for a reply
 * @param comment Reply comment
 * @returns string | null
 */
export function getParentCommentId(comment: NDKEvent): string | null {
    // First check if this is a reply at all
    if (!isReplyToComment(comment)) {
        return null
    }

    // Look for the comment reference in e-tags
    // Exclude e-tags that reference the station (usually with k:31237)
    for (const tag of comment.tags) {
        if (tag[0].toLowerCase() === 'e') {
            // Skip station references which should have a k-tag with 31237
            const isStationReference = comment.tags.some((t) => t[0].toLowerCase() === 'k' && t[1] === '31237')

            if (!isStationReference && tag[1]) {
                // This should be the parent comment reference
                return tag[1]
            }
        }
    }

    // Look specifically for a combination of 'e' tag and 'k:1111' tag
    // This is the most reliable pattern for comment replies
    let parentId = null
    for (const tag of comment.tags) {
        if (tag[0].toLowerCase() === 'e') {
            // Find the last e-tag in the tags array, which should be the parent comment
            // This works because station references typically come first
            parentId = tag[1]
        }
    }

    return parentId
}

/**
 * Get all root comments for a station (comments that aren't replies to other comments)
 * @param comments Array of all comments for a station
 * @returns NDKEvent[]
 */
export function getRootComments(comments: NDKEvent[]): NDKEvent[] {
    return comments
        .filter((comment) => !isReplyToComment(comment))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
}

/**
 * Get replies to a specific comment
 * @param comments Array of all comments for a station
 * @param commentId ID of the parent comment
 * @returns NDKEvent[]
 */
export function getReplies(comments: NDKEvent[], commentId: string): NDKEvent[] {
    // Look for comments that have:
    // 1. An e-tag with the parent comment ID
    // 2. A k-tag with 1111 (COMMENT_KIND)
    // This is a more direct approach than using isReplyToComment

    return comments
        .filter((comment) => {
            // First verify it has a k-tag for COMMENT_KIND
            const hasCommentKindTag = comment.tags.some(
                (tag) => tag[0].toLowerCase() === 'k' && tag[1] === COMMENT_KIND.toString(),
            )

            if (!hasCommentKindTag) {
                return false
            }

            // Now check if it references our specific commentId
            // The last e-tag is typically the direct parent
            const eTags = comment.tags.filter((tag) => tag[0].toLowerCase() === 'e')

            // If the comment has at least one e-tag pointing to commentId, it's a reply
            return eTags.some((tag) => tag[1] === commentId)
        })
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
}
