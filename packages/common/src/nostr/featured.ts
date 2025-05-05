import NDK, { NDKEvent, NDKKind, NDKSubscriptionCacheUsage, type NDKFilter } from '@nostr-dev-kit/ndk'
import { FEATURED_LIST_LABEL, parseFeaturedListEvent, type FeaturedList } from './favorites'
import { getStationByCoordinates, mapNostrEventToStation } from './radio'

/**
 * Subscribe to featured station lists
 * This function subscribes to featured station lists events in the relays
 *
 * @param ndk NDK instance to use for subscription
 * @param options Optional parameters like topic filter
 * @param onEvent Callback for each featured list event
 * @returns NDK subscription
 */
export function subscribeToFeaturedLists(
    ndk: NDK,
    options?: {
        topic?: string // Optional: only subscribe to lists with this topic
        since?: number // Only fetch lists since this timestamp
    },
    onEvent?: (event: FeaturedList) => void,
) {
    const filter: NDKFilter = {
        kinds: [NDKKind.AppSpecificData],
        '#l': [FEATURED_LIST_LABEL], // Filter by the featured list label
    }

    // Add topic filter if specified
    if (options?.topic) {
        filter['#topic'] = [options.topic]
    }

    // Add time filter if specified
    if (options?.since) {
        filter.since = options.since
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    })

    if (onEvent) {
        subscription.on('event', (event: NDKEvent) => {
            try {
                const featuredList = parseFeaturedListEvent(event)
                onEvent(featuredList)
            } catch (error) {
                console.warn('Failed to parse featured list event:', error)
            }
        })
    }

    return subscription
}

/**
 * Fetch all featured station lists
 *
 * @param ndk NDK instance to use for fetching
 * @param options Optional parameters like topic filter and time range
 * @returns Promise resolving to an array of featured lists
 */
export async function fetchFeaturedLists(
    ndk: NDK,
    options?: {
        topic?: string // Optional: only fetch lists with this topic
        since?: number // Optional: only fetch lists since this timestamp
        authors?: string[] // Optional: only fetch lists by these authors
        limit?: number // Optional: limit the number of results
    },
): Promise<FeaturedList[]> {
    const filter: NDKFilter = {
        kinds: [NDKKind.AppSpecificData],
        '#l': [FEATURED_LIST_LABEL],
        '#t': ['featured'],
        limit: options?.limit || 10,
    }

    if (options?.topic) {
        filter['#topic'] = [options.topic]
    }

    if (options?.authors?.length) {
        filter.authors = options.authors
    }

    if (options?.since) {
        filter.since = options.since
    } else {
        // Default to last 30 days
        filter.since = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30
    }

    const events = await ndk.fetchEvents(filter)

    return Array.from(events)
        .map((event) => {
            try {
                return parseFeaturedListEvent(event)
            } catch (error) {
                console.warn('Failed to parse featured list event:', error)
                return null
            }
        })
        .filter((list): list is FeaturedList => list !== null)
}

/**
 * Find a specific featured list by topic
 *
 * @param ndk NDK instance to use for fetching
 * @param topic The topic identifier of the featured list
 * @returns Promise resolving to the featured list or null if not found
 */
export async function findFeaturedListByTopic(ndk: NDK, topic: string): Promise<FeaturedList | null> {
    const filter: NDKFilter = {
        kinds: [NDKKind.AppSpecificData],
        '#l': [FEATURED_LIST_LABEL],
        '#topic': [topic],
        limit: 1,
    }

    const events = await ndk.fetchEvents(filter)
    const event = Array.from(events)[0]

    if (!event) {
        return null
    }

    try {
        return parseFeaturedListEvent(event)
    } catch (error) {
        console.warn('Failed to parse featured list event:', error)
        return null
    }
}

/**
 * Get featured lists with their stations loaded
 * This is useful for showing featured lists on the homepage with their stations
 *
 * @param ndk NDK instance to use for fetching
 * @param options Optional parameters like limit and filter
 * @returns Promise resolving to an array of featured lists with stations
 */
export async function getFeaturedListsForHomepage(
    ndk: NDK,
    options?: {
        limit?: number
        withStations?: boolean
    },
): Promise<FeaturedList[]> {
    // Get featured lists
    const limit = options?.limit || 3 // Default to 3 lists for homepage
    const lists = await fetchFeaturedLists(ndk, { limit })

    // If we don't need to load stations, return the lists as is
    if (!options?.withStations) {
        return lists
    }

    // For each list, fetch and convert stations to proper Station objects
    const listsWithStations = await Promise.all(
        lists.map(async (list) => {
            // Process each station reference
            const stationPromises = list.stations.map(async (stationRef) => {
                try {
                    // Handle FeaturedStation objects
                    // Extract coordinates from event_id (kind:pubkey:dtag format)
                    if (typeof stationRef === 'object' && 'event_id' in stationRef) {
                        const parts = stationRef.event_id.split(':')
                        if (parts.length >= 3) {
                            const pubkey = parts[1]
                            const dTag = parts[2]

                            // Fetch the station event
                            const filter = {
                                kinds: [parseInt(parts[0])],
                                authors: [pubkey],
                                '#d': [dTag],
                            }

                            const event = await ndk.fetchEvent(filter)
                            if (event) {
                                console.log('event', event)
                                return mapNostrEventToStation(event)
                            }
                        }
                    }
                    return null
                } catch (error) {
                    console.warn('Failed to fetch station:', error)
                    return null
                }
            })

            // Wait for all stations to be fetched and converted
            const stations = (await Promise.all(stationPromises)).filter(Boolean)

            // Return updated list with proper Station objects
            return {
                ...list,
                stations,
            }
        }),
    )

    return listsWithStations
}

/**
 * Index for mapping lists to their appropriate display sections on homepage
 */
export const HOMEPAGE_LAYOUT = {
    // Section 1: 2x2 grid (first featured list)
    GRID_2X2: 0,

    // Section 2: 1x2 grid (second featured list)
    GRID_1X2: 1,

    // Section 3: 3x1 grid (third featured list)
    GRID_3X2: 2,
}
