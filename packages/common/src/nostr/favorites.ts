import NDK, { NDKEvent, type NostrEvent, NDKSubscriptionCacheUsage, type NDKFilter, NDKKind } from '@nostr-dev-kit/ndk'
import { createStationDTagValue } from './radio'
import { RADIO_EVENT_KINDS } from '../schemas/events'
import { envStore } from '../lib/store/env'

/**
 * Favorites list types following NIP-78 app-specific data
 */
// The 'l' tag value for radio favorites
export const FAVORITES_LIST_TYPE = 'radio_favorites'

export interface FavoritesList {
    id: string
    name: string
    description: string
    favorites: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
        relay_url?: string
        pubkey?: string
        tags?: string[][]
    }[]
    created_at: number
    pubkey: string
    tags: string[][]
}

export interface FavoritesListContent {
    name: string
    description: string
}

/**
 * Creates a proper station naddr reference for use in 'a' tags
 * Format should be: 31237:pubkey:d-tag
 * According to SPEC.md, we should use the format "kind:pubkey:d-tag" instead of naddr
 */
export function createStationAddrReference(station: {
    id?: string
    pubkey?: string
    naddr?: string
    tags?: string[][]
}): string {
    // Check if we have pubkey and a d-tag, which is the preferred format according to SPEC.md
    const dTag = station.tags?.find((tag) => tag[0] === 'd')

    if (station.pubkey && dTag?.[1]) {
        // Generate reference in format "kind:pubkey:d-tag" - using only the d-tag value as identifier
        // The d-tag value should be the unique identifier, not the station name
        return `${RADIO_EVENT_KINDS.STREAM}:${station.pubkey}:${dTag[1]}`
    }

    // If we have a valid naddr but can't construct the proper reference, use it as fallback
    if (station.naddr) {
        return station.naddr
    }

    // Last resort: use the ID if no better option is available
    return station.id || ''
}

/**
 * Creates an unsigned favorites list event using NIP-78
 */
export function createFavoritesEvent(
    content: FavoritesListContent,
    favorites: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
        relay_url?: string
        pubkey?: string
        tags?: string[][]
    }[],
    pubkey: string,
): NostrEvent {
    // Get app pubkey from env if available
    const appPubkey = envStore.state.env?.VITE_APP_PUBKEY || ''

    return {
        kind: NDKKind.AppSpecificData,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['d', `favorites-${createStationDTagValue()}`],
            ['l', FAVORITES_LIST_TYPE], // Add 'l' tag to identify this as radio favorites
            ['name', content.name],
            ['description', content.description],
            ...favorites.map((fav) => {
                // Generate proper 'a' tag reference in format "kind:pubkey:d-tag" if possible
                let addressRef = ''

                // If we have the data to construct a proper reference, do it
                if (fav.pubkey && fav.tags) {
                    const dTag = fav.tags.find((tag: string[]) => tag[0] === 'd')
                    if (dTag?.[1]) {
                        addressRef = `${RADIO_EVENT_KINDS.STREAM}:${fav.pubkey}:${dTag[1]}`
                    }
                }

                // Otherwise fall back to supplied naddr or empty string
                if (!addressRef) {
                    addressRef = fav.naddr || ''
                }

                return ['a', addressRef, fav.relay_url || '', fav.name, fav.added_at.toString()]
            }),
            ['t', 'favorites'],
            // Add app reference if available
            ...(appPubkey ? [['p', appPubkey]] : []),
        ],
        content: JSON.stringify(content),
        pubkey,
    }
}

/**
 * Publish a new favorites list
 */
export async function publishFavoritesList(
    ndk: NDK,
    content: FavoritesListContent,
    favorites: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
        relay_url?: string
        pubkey?: string
        tags?: string[][]
    }[] = [],
): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available')
    }

    const pubkey = await ndk.signer.user().then((user) => user.pubkey)
    const event = createFavoritesEvent(content, favorites, pubkey)
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
    updatedFavorites?: {
        event_id: string
        name: string
        added_at: number
        naddr?: string
        relay_url?: string
        pubkey?: string
        tags?: string[][]
    }[],
): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available')
    }

    const pubkey = await ndk.signer.user().then((user) => user.pubkey)
    const appPubkey = envStore.state.env?.VITE_APP_PUBKEY || ''

    // Get the existing d-tag to preserve it
    const dTag = favoritesList.tags.find((tag) => tag[0] === 'd')

    // Create updated content by merging existing with updates
    const content: FavoritesListContent = {
        name: updatedContent.name ?? favoritesList.name,
        description: updatedContent.description ?? favoritesList.description,
    }

    // Use the updated favorites list or the existing one
    const favorites = updatedFavorites ?? favoritesList.favorites

    // Create tag array with preserved d-tag
    const tags = [
        dTag || ['d', `favorites-${createStationDTagValue()}`],
        ['l', FAVORITES_LIST_TYPE], // Add 'l' tag to identify this as radio favorites
        ['name', content.name],
        ['description', content.description],
        ...favorites.map((fav) => {
            // Generate proper 'a' tag reference in format "kind:pubkey:d-tag" if possible
            let addressRef = ''

            // If we have the data to construct a proper reference, do it
            if (fav.pubkey && fav.tags) {
                const dTag = fav.tags.find((tag: string[]) => tag[0] === 'd')
                if (dTag?.[1]) {
                    addressRef = `${RADIO_EVENT_KINDS.STREAM}:${fav.pubkey}:${dTag[1]}`
                }
            }

            // Otherwise fall back to supplied naddr or empty string
            if (!addressRef) {
                addressRef = fav.naddr || ''
            }

            return ['a', addressRef, fav.relay_url || '', fav.name, fav.added_at.toString()]
        }),
        ['t', 'favorites'],
        // Add app reference if available
        ...(appPubkey ? [['p', appPubkey]] : []),
    ]

    const event: NostrEvent = {
        kind: NDKKind.AppSpecificData,
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
        relay_url?: string
        pubkey?: string
        tags?: string[][]
    },
): Promise<NDKEvent> {
    // Check if the station is already in favorites
    const isAlreadyFavorite = favoritesList.favorites.some((fav) => fav.event_id === station.id)

    if (isAlreadyFavorite) {
        // If it's already a favorite, just return the unmodified list
        const ndkEvent = new NDKEvent(ndk, {
            kind: NDKKind.AppSpecificData,
            content: JSON.stringify({
                name: favoritesList.name,
                description: favoritesList.description,
            }),
            tags: favoritesList.tags,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: '',
        })
        return ndkEvent
    }

    console.log('station', station)

    // Generate address reference using decoded coordinates (kind:pubkey:d-tag)
    // based on SPEC.md rather than using naddr directly
    const stationAddr = createStationAddrReference(station)

    console.log('stationAddr', stationAddr)

    // Add the station to favorites
    const updatedFavorites = [
        ...favoritesList.favorites,
        {
            event_id: station.id,
            name: station.name,
            naddr: stationAddr, // Use the decoded coordinates format here
            relay_url: station.relay_url || '',
            pubkey: station.pubkey, // Include pubkey for proper reference creation
            tags: station.tags, // Include tags for proper reference creation
            added_at: Math.floor(Date.now() / 1000),
        },
    ]

    // Update the list with the new favorites
    return updateFavoritesList(
        ndk,
        favoritesList,
        {
            name: favoritesList.name,
            description: favoritesList.description,
        },
        updatedFavorites,
    )
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
            kind: NDKKind.AppSpecificData,
            content: JSON.stringify({
                name: favoritesList.name,
                description: favoritesList.description,
            }),
            tags: favoritesList.tags,
            created_at: Math.floor(Date.now() / 1000),
            pubkey: '',
        })
        return ndkEvent
    }

    // Update the list with the station removed
    return updateFavoritesList(
        ndk,
        favoritesList,
        {
            name: favoritesList.name,
            description: favoritesList.description,
        },
        updatedFavorites,
    )
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
    if (event.kind !== NDKKind.AppSpecificData) {
        throw new Error('Invalid event kind for favorites list')
    }

    // Validate that this is a radio favorites list using the 'l' tag
    const lTag = event.tags.find((tag) => tag[0] === 'l' && tag[1] === FAVORITES_LIST_TYPE)
    if (!lTag) {
        throw new Error('Not a valid radio favorites list')
    }

    try {
        // Parse basic content (name and description) from content or tags
        let name = ''
        let description = ''

        try {
            const content = JSON.parse(event.content)
            name = content.name || ''
            description = content.description || ''
        } catch (e) {
            // If content parsing fails, try to get from tags
            const nameTag = event.tags.find((tag) => tag[0] === 'name')
            const descTag = event.tags.find((tag) => tag[0] === 'description')
            name = nameTag?.[1] || 'Untitled Favorites List'
            description = descTag?.[1] || ''
        }

        // Process a-tags for favorites
        const aTags = event.tags.filter((tag) => tag[0] === 'a')

        // Format: ['a', "kind:pubkey:d-tag", relay_url?, petname?, added_at?]
        const favorites = aTags
            .map((tag) => {
                if (tag.length < 2) return null

                const addressRef = tag[1]

                // Skip if the addressRef is empty
                if (!addressRef) return null

                // Extract information from the address reference (kind:pubkey:d-tag)
                let event_id = ''
                let naddr = addressRef

                // Parse the address parts if it follows the "kind:pubkey:d-tag" format
                const parts = addressRef.split(':')
                if (parts.length >= 3) {
                    // It's in the format "kind:pubkey:d-tag"
                    // Use the full address as is for indexing
                    event_id = addressRef
                } else {
                    // It might be a simple event ID or some other format
                    event_id = addressRef
                }

                // Get optional fields
                const relay_url = tag[2] || undefined
                const petname = tag[3] || 'Unknown Station'
                const added_at = tag[4] ? parseInt(tag[4], 10) : Math.floor(Date.now() / 1000)

                return {
                    event_id,
                    name: petname,
                    naddr,
                    relay_url,
                    added_at,
                }
            })
            .filter(Boolean) as any[]

        return {
            id: (event as NDKEvent).id || '',
            name,
            description,
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
        kinds: [NDKKind.AppSpecificData],
        '#l': [FAVORITES_LIST_TYPE], // Filter by our radio favorites type
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
        kinds: [NDKKind.AppSpecificData],
        '#l': [FAVORITES_LIST_TYPE], // Filter by our radio favorites type
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
