import type NDK from '@nostr-dev-kit/ndk'
import { NDKEvent, NDKKind, NDKSubscriptionCacheUsage, type NDKFilter, type NDKSubscription } from '@nostr-dev-kit/ndk'

/**
 * Publish a reaction to an event
 */
export async function publishReaction(ndk: NDK, event: NDKEvent, content: string): Promise<NDKEvent> {
    return event.react(content, true)
}

/**
 * Fetch reactions for an event
 */
export async function fetchReactions(ndk: NDK, eventId: string): Promise<NDKEvent[]> {
    const filter: NDKFilter = {
        kinds: [NDKKind.Reaction],
        '#e': [eventId],
    }

    try {
        // Create a timeout promise
        const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) => {
            setTimeout(() => reject(new Error('Fetch timeout')), 3000)
        })

        // Get all reactions with timeout
        const events = await Promise.race([ndk.fetchEvents(filter), timeoutPromise])

        // Filter out invalid events and deduplicate
        const validEvents = new Map<string, NDKEvent>()
        Array.from(events).forEach((event) => {
            if (event.id && validEvents.has(event.id) === false) {
                validEvents.set(event.id, event)
            }
        })

        return Array.from(validEvents.values())
    } catch {
        return []
    }
}

/**
 * Subscribe to reactions for an event
 */
export function subscribeToReactions(
    ndk: NDK,
    eventId: string,
    onReaction?: (event: NDKEvent) => void,
): NDKSubscription {
    const filter: NDKFilter = {
        kinds: [NDKKind.Reaction],
        '#e': [eventId],
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.PARALLEL,
    })

    if (onReaction) {
        const processedIds = new Set<string>()

        subscription.on('event', (event: NDKEvent) => {
            try {
                // Skip if already processed
                if (processedIds.has(event.id)) return

                processedIds.add(event.id)
                onReaction(event)
            } catch {
                // Silent fail
            }
        })
    }

    return subscription
}
