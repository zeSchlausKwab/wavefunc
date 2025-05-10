import NDK, { NDKEvent, NDKKind, NDKSubscriptionCacheUsage, type NDKFilter } from '@nostr-dev-kit/ndk'
import { FEATURED_LIST_LABEL, parseFeaturedListEvent, type FeaturedList } from './favorites'
import { getStationByCoordinates, mapNostrEventToStation } from './radio'
import type { Station } from '../types/station'

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
    options: {
        topic?: string
        since?: number
        authors: string[]
        limit?: number
    },
): Promise<FeaturedList[]> {
    const filter: NDKFilter = {
        kinds: [NDKKind.AppSpecificData],
        '#l': [FEATURED_LIST_LABEL],
        '#t': ['featured'],
        limit: options.limit || 10,
        authors: options.authors,
    }

    if (options.topic) {
        filter['#topic'] = [options.topic]
    }

    if (options.since) {
        filter.since = options.since
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
 * Fetches a specific featured list by its 'd' tag and author, then populates its stations.
 *
 * @param ndk NDK instance
 * @param dTag The 'd' tag identifier of the featured list event
 * @param authorPubkey The pubkey of the author of the list (e.g., the app's pubkey)
 * @param options Optional parameters
 * @returns Promise resolving to the FeaturedList or null if not found or on error
 */
export async function getSpecificFeaturedListByDTag(
    ndk: NDK,
    dTag: string,
    authorPubkey: string,
    options?: {
        withStations?: boolean
    },
): Promise<FeaturedList | null> {
    const filter: NDKFilter = {
        kinds: [NDKKind.AppSpecificData], // Kind 30078
        authors: [authorPubkey],
        '#l': [FEATURED_LIST_LABEL], // 'featured_station_list'
        '#d': [dTag],
        limit: 1,
    };

    try {
        const listEvent = await ndk.fetchEvent(filter);

        if (!listEvent) {
            console.warn(`No featured list found with dTag '${dTag}' and author '${authorPubkey}'`);
            return null;
        }

        const featuredList = parseFeaturedListEvent(listEvent);

        if (!options?.withStations || !featuredList) {
            return featuredList; // Return list without stations if not requested or if parsing failed
        }

        // Fetch and populate stations for this specific list
        const stationPromises = featuredList.stations.map(async (stationRef) => {
            try {
                if (typeof stationRef === 'object' && 'event_id' in stationRef) {
                    const parts = stationRef.event_id.split(':');
                    if (parts.length >= 3) {
                        // const kind = parseInt(parts[0]); // This is kind 31237 for stations
                        const stationPubkey = parts[1];
                        const stationDTag = parts[2];

                        // Fetch the station event by its coordinates
                        // getStationByCoordinates already returns a fully mapped Station object or null
                        const station = await getStationByCoordinates(ndk, stationPubkey, stationDTag);
                        
                        if (station) {
                            return station;
                        }
                        console.warn(`Station not found via getStationByCoordinates for ${stationRef.event_id}`);
                        return null;
                    }
                }
                console.warn(`Invalid station reference in list ${dTag}:`, stationRef);
                return null;
            } catch (error) {
                console.warn(`Failed to fetch/map station for list ${dTag} (ref: ${JSON.stringify(stationRef)}):`, error);
                return null;
            }
        });

        const stations = (await Promise.all(stationPromises))
            .filter((station): station is Station => station !== null);

        return {
            ...featuredList,
            stations: stations, // Now correctly typed as Station[]
        };
    } catch (error) {
        console.error(`Error fetching specific featured list (dTag: ${dTag}):`, error);
        return null;
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
// export async function getFeaturedListsForHomepage(
//     ndk: NDK,
//     options?: {
//         limit?: number
//         withStations?: boolean
//     },
// ): Promise<FeaturedList[]> {
//     const appPubkey = '210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2'
//     const limit = options?.limit || 3
//     const lists = await fetchFeaturedLists(ndk, {
//         authors: [appPubkey],
//         limit,
//     })

//     if (!options?.withStations) {
//         return lists
//     }

//     const listsWithStations = await Promise.all(
//         lists.map(async (list) => {
//             const stationPromises = list.stations.map(async (stationRef) => {
//                 try {
//                     if (typeof stationRef === 'object' && 'event_id' in stationRef) {
//                         const parts = stationRef.event_id.split(':')
//                         if (parts.length >= 3) {
//                             const pubkey = parts[1]
//                             const dTag = parts[2]

//                             const filter = {
//                                 kinds: [parseInt(parts[0])],
//                                 authors: [pubkey],
//                                 '#d': [dTag],
//                             }

//                             const event = await ndk.fetchEvent(filter)
//                             if (event) {
//                                 return mapNostrEventToStation(event)
//                             }
//                         }
//                     }
//                     return null
//                 } catch (error) {
//                     console.warn('Failed to fetch station:', error)
//                     return null
//                 }
//             })

//             const stations = (await Promise.all(stationPromises)).filter(Boolean)

//             return {
//                 ...list,
//                 stations,
//             }
//         }),
//     )

//     return listsWithStations
// }

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
