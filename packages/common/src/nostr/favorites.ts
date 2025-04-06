import NDK, { NDKEvent, type NostrEvent, NDKSubscriptionCacheUsage, type NDKFilter } from '@nostr-dev-kit/ndk'
import { createStationDTagValue, RADIO_EVENT_KINDS } from './radio'

export interface FavoritesList {
    id: string
    name: string
    description: string
    favorites: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
    }[]
    created_at: number
    pubkey: string
    tags: string[][]
}

export interface FavoritesListContent {
    name: string
    description: string
    favorites: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
    }[]
}

/**
 * Creates an unsigned favorites list event
 */
export function createFavoritesEvent(content: FavoritesListContent, pubkey: string): NostrEvent {
    return {
        kind: RADIO_EVENT_KINDS.FAVORITES,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['d', `favorites-${createStationDTagValue()}`],
            ...content.favorites.map((fav) => [
                'a',
                fav.naddr || `${RADIO_EVENT_KINDS.STREAM}:${fav.event_id}:`,
                fav.name,
            ]),
            ['client', 'nostr_radio'],
            ['a', 'nostr_radio'],
            ['t', 'favorites'],
        ],
        content: JSON.stringify(content),
        pubkey,
    }
}

/**
 * Publish a new favorites list
 */
export async function publishFavoritesList(ndk: NDK, content: FavoritesListContent): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available')
    }

    const pubkey = await ndk.signer.user().then((user) => user.pubkey)
    const event = createFavoritesEvent(content, pubkey)
    const ndkEvent = new NDKEvent(ndk, event)
    await ndkEvent.publish()
    return ndkEvent
}

/**
 * Update an existing favorites list
 */
export async function updateFavoritesList(
    ndk: NDK,
    favoritesList: FavoritesList,
    updatedContent: Partial<FavoritesListContent>,
): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available')
    }

    const pubkey = await ndk.signer.user().then((user) => user.pubkey)

    // Get the existing d-tag to preserve it
    const dTag = favoritesList.tags.find((tag) => tag[0] === 'd')

    // Create updated content by merging existing with updates
    const content: FavoritesListContent = {
        name: updatedContent.name ?? favoritesList.name,
        description: updatedContent.description ?? favoritesList.description,
        favorites: updatedContent.favorites ?? favoritesList.favorites,
    }

    // Create tag array with preserved d-tag
    const tags = [
        dTag || ['d', `favorites-${createStationDTagValue()}`],
        ...content.favorites.map((fav) => ['a', fav.naddr || `${RADIO_EVENT_KINDS.STREAM}:${fav.event_id}:`, fav.name]),
        ['client', 'nostr_radio'], // Keep for backward compatibility
        ['a', 'nostr_radio'], // Add indexed app tag
        ['t', 'favorites'], // Topic tag for filtering
    ]

    const event: NostrEvent = {
        kind: RADIO_EVENT_KINDS.FAVORITES,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: JSON.stringify(content),
        pubkey,
    }

    const ndkEvent = new NDKEvent(ndk, event)
    await ndkEvent.publish()
    return ndkEvent
}

/**
 * Add a station to a favorites list
 */
export async function addStationToFavorites(
    ndk: NDK,
    favoritesList: FavoritesList,
    station: {
        id: string
        name: string
        naddr?: string
    },
): Promise<NDKEvent> {
    // Check if the station is already in favorites
    const isAlreadyFavorite = favoritesList.favorites.some((fav) => fav.event_id === station.id)

    if (isAlreadyFavorite) {
        // If it's already a favorite, just return the unmodified list
        const ndkEvent = new NDKEvent(ndk, {
            kind: RADIO_EVENT_KINDS.FAVORITES,
            content: JSON.stringify(favoritesList),
            tags: favoritesList.tags,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: '',
        })
        return ndkEvent
    }

    // Add the station to favorites
    const updatedFavorites = [
        ...favoritesList.favorites,
        {
            event_id: station.id,
            name: station.name,
            naddr: station.naddr,
            added_at: Math.floor(Date.now() / 1000),
        },
    ]

    // Update the list with the new favorites
    return updateFavoritesList(ndk, favoritesList, {
        favorites: updatedFavorites,
    })
}

/**
 * Remove a station from a favorites list
 */
export async function removeStationFromFavorites(
    ndk: NDK,
    favoritesList: FavoritesList,
    stationId: string,
): Promise<NDKEvent> {
    // Filter out the station to remove
    const updatedFavorites = favoritesList.favorites.filter((fav) => fav.event_id !== stationId)

    // If nothing changed, return early
    if (updatedFavorites.length === favoritesList.favorites.length) {
        const ndkEvent = new NDKEvent(ndk, {
            kind: RADIO_EVENT_KINDS.FAVORITES,
            content: JSON.stringify(favoritesList),
            tags: favoritesList.tags,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: '',
        })
        return ndkEvent
    }

    // Update the list with the station removed
    return updateFavoritesList(ndk, favoritesList, {
        favorites: updatedFavorites,
    })
}

/**
 * Delete a favorites list
 */
export async function deleteFavoritesList(ndk: NDK, favoritesListId: string): Promise<NDKEvent> {
    const deleteEvent = new NDKEvent(ndk, {
        kind: 5, // Deletion event kind
        tags: [['e', favoritesListId]],
        content: 'Deleted favorites list',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
    })

    await deleteEvent.publish()
    return deleteEvent
}

/**
 * Parse a favorites list event
 */
export function parseFavoritesEvent(event: NDKEvent | NostrEvent): FavoritesList {
    if (event.kind !== RADIO_EVENT_KINDS.FAVORITES) {
        throw new Error('Invalid event kind for favorites list')
    }

    try {
        const content = JSON.parse(event.content) as FavoritesListContent

        // Extract favorites from content or tags
        let favorites = content.favorites || []
        if (favorites.length === 0) {
            // Filter and process a-tags, excluding the app identifier tag
            const aTags = event.tags.filter((tag) => tag[0] === 'a' && tag[1] !== 'nostr_radio')

            // Process a-tags for actual station references
            favorites = aTags
                .map((tag) => {
                    // Extract event_id from addressable reference (kind:pubkey:d-value)
                    const parts = tag[1].split(':')
                    // If it's a proper a-tag with kind:pubkey:d-tag format
                    let event_id = ''
                    let naddr = undefined

                    if (parts.length >= 3) {
                        // It's a proper NIP-19 a-tag
                        // For 30023:pubkey:d-tag format, we use the d-tag as event_id
                        event_id = parts[2] || ''
                        naddr = tag[1] // Store the full a-tag for later use
                    } else {
                        // It might be a simple event ID or malformed tag
                        // Use the raw value, hoping it's a valid event ID
                        event_id = tag[1]
                    }

                    // Skip if it's just "nostr_radio" which is an app tag, not an event ID
                    if (event_id === 'nostr_radio' || event_id === '') {
                        return null
                    }

                    return {
                        event_id,
                        name: tag[2] || 'Unknown Station',
                        naddr: naddr,
                        added_at: Math.floor(Date.now() / 1000),
                    }
                })
                .filter(Boolean) as any[]
        }

        return {
            id: (event as NDKEvent).id || '',
            name: content.name,
            description: content.description,
            favorites,
            created_at: event.created_at || Math.floor(Date.now() / 1000),
            pubkey: event.pubkey,
            tags: event.tags as string[][],
        }
    } catch (error) {
        console.error('Error parsing favorites list:', error)
        throw new Error('Invalid favorites list format')
    }
}

/**
 * Subscribe to favorites lists
 */
export function subscribeToFavoritesLists(
    ndk: NDK,
    options?: {
        pubkey?: string // Optional: only subscribe to lists by this pubkey
    },
    onEvent?: (event: FavoritesList) => void,
) {
    const filter: NDKFilter = {
        kinds: [RADIO_EVENT_KINDS.FAVORITES],
        '#a': ['nostr_radio'], // Filter by indexed app tag
        '#t': ['favorites'], // Filter by topic tag
    }

    // Add pubkey filter if specified
    if (options?.pubkey) {
        filter.authors = [options.pubkey]
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    })

    if (onEvent) {
        subscription.on('event', (event: NDKEvent) => {
            try {
                const favoritesList = parseFavoritesEvent(event)
                onEvent(favoritesList)
            } catch (error) {
                // Silently skip invalid events
                console.warn('Failed to parse favorites list event:', error)
            }
        })
    }

    return subscription
}

/**
 * Fetch all favorites lists for a user
 */
export async function fetchFavoritesLists(
    ndk: NDK,
    options?: {
        pubkey?: string // Optional: only fetch lists by this pubkey
        since?: number // Optional: only fetch lists since this timestamp
    },
): Promise<FavoritesList[]> {
    const filter: NDKFilter = {
        kinds: [RADIO_EVENT_KINDS.FAVORITES],
        '#a': ['nostr_radio'], // Filter by indexed app tag
        '#t': ['favorites'], // Filter by topic tag
    }

    // Add pubkey filter if specified
    if (options?.pubkey) {
        filter.authors = [options.pubkey]
    }

    // Add time filter if specified
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
                return parseFavoritesEvent(event)
            } catch (error) {
                console.warn('Failed to parse favorites list event:', error)
                return null
            }
        })
        .filter((list): list is FavoritesList => list !== null)
}
