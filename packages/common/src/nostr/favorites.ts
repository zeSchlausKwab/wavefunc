import NDK, {
    NDKEvent,
    type NostrEvent,
    NDKSubscriptionCacheUsage,
    type NDKFilter,
    NDKKind,
    type NDKTag,
} from '@nostr-dev-kit/ndk'
import { createStationDTagValue } from './radio'
import { RADIO_EVENT_KINDS } from '../schemas/events'
import { envStore } from '../lib/store/env'

/**
 * Favorites list types following NIP-78 app-specific data
 */
// The 'l' tag value for radio favorites
export const FAVORITES_LIST_TYPE = 'radio_favorites'

// Type for a station reference in favorites
export interface FavoriteStation {
    event_id: string
    name: string
    added_at: number
    naddr?: string
    relay_url?: string
    pubkey?: string
    tags?: string[][]
}

export interface FavoritesList {
    id: string
    name: string
    description: string
    image?: string
    banner?: string
    favorites: FavoriteStation[]
    created_at: number
    pubkey: string
    tags: string[][]
}

export interface FavoritesListContent {
    name: string
    description: string
    image?: string
    banner?: string
}

/**
 * Creates a proper station reference for use in 'a' tags
 * Format: "kind:pubkey:d-tag" - SPEC.md preferred format
 */
export function createStationAddrReference(station: {
    id?: string
    pubkey?: string
    naddr?: string
    tags?: string[][]
}): string {
    // First try to create the reference using pubkey and d-tag
    const dTag = station.tags?.find((tag) => tag[0] === 'd')

    if (station.pubkey && dTag?.[1]) {
        return `${RADIO_EVENT_KINDS.STREAM}:${station.pubkey}:${dTag[1]}`
    }

    // Fallback to naddr or id
    return station.naddr || station.id || ''
}

/**
 * Creates a favorites list event
 */
export function createFavoritesEvent(
    content: FavoritesListContent,
    favorites: FavoriteStation[],
    pubkey: string,
): NostrEvent {
    const appPubkey = envStore.state.env?.VITE_APP_PUBKEY || ''
    const timestamp = Math.floor(Date.now() / 1000)

    // Create base tags
    const eventTags = [
        ['d', createStationDTagValue()],
        ['l', FAVORITES_LIST_TYPE],
        ['name', content.name],
        ['description', content.description],
        ...createFavoritesTags(favorites),
        ['t', 'favorites'],
        // Add app reference if available
        ...(appPubkey ? [['p', appPubkey]] : []),
    ]

    // Add image tag if provided
    if (content.image) {
        eventTags.push(['image', content.image])
    }

    // Add banner tag if provided
    if (content.banner) {
        eventTags.push(['banner', content.banner])
    }

    return {
        kind: NDKKind.AppSpecificData,
        created_at: timestamp,
        tags: eventTags,
        content: JSON.stringify(content),
        pubkey,
    }
}

/**
 * Helper function to create 'a' tags for favorites
 */
function createFavoritesTags(favorites: FavoriteStation[]): string[][] {
    return favorites.map((fav) => {
        // Generate proper address reference
        let addressRef = ''

        if (fav.pubkey && fav.tags) {
            const dTag = fav.tags.find((tag) => tag[0] === 'd')
            if (dTag?.[1]) {
                addressRef = `${RADIO_EVENT_KINDS.STREAM}:${fav.pubkey}:${dTag[1]}`
            }
        }

        if (!addressRef) {
            addressRef = fav.naddr || fav.event_id || ''
        }

        return ['a', addressRef, fav.relay_url || '', fav.name, fav.added_at.toString()]
    })
}

/**
 * Publish a new favorites list
 */
export async function publishFavoritesList(
    ndk: NDK,
    content: FavoritesListContent,
    favorites: FavoriteStation[] = [],
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
    updatedFavorites?: FavoriteStation[],
): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available')
    }

    const pubkey = await ndk.signer.user().then((user) => user.pubkey)
    const appPubkey = envStore.state.env?.VITE_APP_PUBKEY || ''
    const dTag = favoritesList.tags.find((tag) => tag[0] === 'd')

    // Merge content
    const content: FavoritesListContent = {
        name: updatedContent.name ?? favoritesList.name,
        description: updatedContent.description ?? favoritesList.description,
        image: updatedContent.image ?? favoritesList.image,
        banner: updatedContent.banner ?? favoritesList.banner,
    }

    // Use updated favorites or existing ones
    const favorites = updatedFavorites ?? favoritesList.favorites

    // Create base tags
    const eventTags = [
        dTag as NDKTag,
        ['l', FAVORITES_LIST_TYPE],
        ['name', content.name],
        ['description', content.description],
        ...createFavoritesTags(favorites),
        ['t', 'favorites'],
        ...(appPubkey ? [['p', appPubkey]] : []),
    ]

    // Add image tag if provided
    if (content.image) {
        eventTags.push(['image', content.image])
    }

    // Add banner tag if provided
    if (content.banner) {
        eventTags.push(['banner', content.banner])
    }

    const event: NostrEvent = {
        kind: NDKKind.AppSpecificData,
        created_at: Math.floor(Date.now() / 1000),
        tags: eventTags,
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
    // Check if already a favorite
    if (favoritesList.favorites.some((fav) => fav.event_id === station.id)) {
        return createUnmodifiedEvent(ndk, favoritesList)
    }

    // Generate address reference
    const stationAddr = createStationAddrReference(station)

    // Add to favorites
    const updatedFavorites = [
        ...favoritesList.favorites,
        {
            event_id: station.id,
            name: station.name,
            naddr: stationAddr,
            relay_url: station.relay_url || '',
            pubkey: station.pubkey,
            tags: station.tags,
            added_at: Math.floor(Date.now() / 1000),
        },
    ]

    // Update list
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
    // Filter out the station
    const updatedFavorites = favoritesList.favorites.filter((fav) => fav.event_id !== stationId)

    // If nothing changed, return early
    if (updatedFavorites.length === favoritesList.favorites.length) {
        return createUnmodifiedEvent(ndk, favoritesList)
    }

    // Update the list
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
 * Helper function to create an unmodified event
 */
function createUnmodifiedEvent(ndk: NDK, favoritesList: FavoritesList): NDKEvent {
    return new NDKEvent(ndk, {
        kind: NDKKind.AppSpecificData,
        content: JSON.stringify({
            name: favoritesList.name,
            description: favoritesList.description,
        }),
        tags: favoritesList.tags,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: favoritesList.pubkey,
    })
}

/**
 * Delete a favorites list
 */
export async function deleteFavoritesList(ndk: NDK, favoritesListId: string): Promise<NDKEvent> {
    if (!ndk.signer) {
        throw new Error('No signer available')
    }

    const deleteEvent = new NDKEvent(ndk, {
        kind: 5, // Deletion event kind
        tags: [['e', favoritesListId]],
        content: 'Deleted favorites list',
        created_at: Math.floor(Date.now() / 1000),
    })

    try {
        await deleteEvent.publish()
        console.log('Successfully deleted favorites list with ID:', favoritesListId)
        return deleteEvent
    } catch (error) {
        console.error('Error deleting favorites list:', error)
        throw error
    }
}

/**
 * Parse a favorites list event
 */
export function parseFavoritesEvent(event: NDKEvent | NostrEvent): FavoritesList {
    if (event.kind !== NDKKind.AppSpecificData) {
        throw new Error('Invalid event kind for favorites list')
    }

    // Validate that this is a radio favorites list
    const lTag = event.tags.find((tag) => tag[0] === 'l' && tag[1] === FAVORITES_LIST_TYPE)
    if (!lTag) {
        throw new Error('Not a valid radio favorites list')
    }

    try {
        // Parse name and description
        const { name, description, image, banner } = parseListContent(event)

        // Parse favorites from a-tags
        const favorites = parseFavorites(event)

        return {
            id: (event as NDKEvent).id || '',
            name,
            description,
            image,
            banner,
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
 * Helper to parse list content
 */
function parseListContent(event: NDKEvent | NostrEvent): { name: string; description: string; image?: string; banner?: string } {
    let name = ''
    let description = ''
    let image: string | undefined
    let banner: string | undefined

    try {
        // Try JSON content first
        const content = JSON.parse(event.content)
        name = content.name || ''
        description = content.description || ''
        image = content.image
        banner = content.banner
    } catch (e) {
        // Fallback to tags
        const nameTag = event.tags.find((tag) => tag[0] === 'name')
        const descTag = event.tags.find((tag) => tag[0] === 'description')
        const imageTag = event.tags.find((tag) => tag[0] === 'image')
        const bannerTag = event.tags.find((tag) => tag[0] === 'banner')
        
        name = nameTag?.[1] || 'Untitled Favorites List'
        description = descTag?.[1] || ''
        image = imageTag?.[1]
        banner = bannerTag?.[1]
    }

    return { name, description, image, banner }
}

/**
 * Helper to parse favorites from a-tags
 */
function parseFavorites(event: NDKEvent | NostrEvent): FavoriteStation[] {
    const aTags = event.tags.filter((tag) => tag[0] === 'a')

    return aTags
        .map((tag) => {
            if (tag.length < 2) return null

            const addressRef = tag[1]
            if (!addressRef) return null

            // Format: ['a', addressRef, relay_url?, petname?, added_at?]
            const relay_url = tag[2] || undefined
            const petname = tag[3] || 'Unknown Station'
            const added_at = tag[4] ? parseInt(tag[4], 10) : Math.floor(Date.now() / 1000)

            return {
                event_id: addressRef,
                name: petname,
                naddr: addressRef,
                relay_url,
                added_at,
            }
        })
        .filter(Boolean) as FavoriteStation[]
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
        '#l': [FAVORITES_LIST_TYPE],
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
        pubkey?: string // Only fetch lists by this pubkey
        since?: number // Only fetch lists since this timestamp
    },
): Promise<FavoritesList[]> {
    const filter: NDKFilter = {
        kinds: [NDKKind.AppSpecificData],
        '#l': [FAVORITES_LIST_TYPE],
        '#t': ['favorites'],
    }

    if (options?.pubkey) {
        filter.authors = [options.pubkey]
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
                return parseFavoritesEvent(event)
            } catch (error) {
                console.warn('Failed to parse favorites list event:', error)
                return null
            }
        })
        .filter((list): list is FavoritesList => list !== null)
}
