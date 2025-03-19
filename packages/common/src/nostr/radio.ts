import type { NDKKind, NostrEvent } from '@nostr-dev-kit/ndk'
import { RadioEventContentSchema } from '../schemas/radio'
import type { z } from 'zod'
import NDK, { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import type { NDKEvent } from '@nostr-dev-kit/ndk'
import type { Station } from '../types/station'
import { nip19 } from 'nostr-tools'

export const RADIO_EVENT_KINDS = {
    STREAM: 31227,
    FAVORITES: 30078,
    // SONG_HISTORY: 31339,
    // SONG_LIBRARY: 31340,
} as const

type RadioEventContent = z.infer<typeof RadioEventContentSchema>

/**
 * Creates a random 'd' tag value
 * @returns A random ID to use as d-tag value
 */
export function createStationDTagValue(): string {
    return Math.random().toString(36).substring(2, 14)
}

/**
 * Creates an unsigned radio station event
 */
export function createRadioEvent(
    content: {
        name: string
        description: string
        website: string
        streams: {
            url: string
            format: string
            quality: {
                bitrate: number
                codec: string
                sampleRate: number
            }
            primary?: boolean
        }[]
    },
    tags: string[][],
    existingTags?: string[][],
): NostrEvent {
    let newTags = [...tags]

    // Add name and description tags if not already present
    const hasNameTag = newTags.some((tag) => tag[0] === 'name')
    if (!hasNameTag) {
        newTags.push(['name', content.name])
    }

    const hasDescriptionTag = newTags.some((tag) => tag[0] === 'description')
    if (!hasDescriptionTag) {
        newTags.push(['description', content.description])
    }

    if (existingTags) {
        const existingDTag = existingTags.find((tag) => tag[0] === 'd')
        newTags = newTags.filter((tag) => tag[0] !== 'd')

        if (existingDTag) {
            newTags.push(existingDTag)
        } else {
            const newDTag = ['d', createStationDTagValue()]
            newTags.push(newDTag)
        }
    } else {
        const hasDTag = newTags.some((tag) => tag[0] === 'd')

        if (!hasDTag) {
            const newDTag = ['d', createStationDTagValue()]
            newTags.push(newDTag)
        }
    }

    const hasClientTag = newTags.some((tag) => tag[0] === 'client')
    if (!hasClientTag) {
        newTags.push(['client', 'nostr_radio'])
    }

    return {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        tags: newTags,
        content: JSON.stringify(content),
        pubkey: '',
    }
}

/**
 * Validates and parses a radio station event
 */
export function parseRadioEvent(event: NDKEvent | NostrEvent) {
    if (event.kind !== RADIO_EVENT_KINDS.STREAM) {
        throw new Error('Invalid event kind')
    }

    const content = JSON.parse(event.content)
    return {
        name: content.name,
        description: content.description,
        website: content.website,
        streams: content.streams,
        tags: event.tags as string[][],
    }
}

/**
 * Subscribe to radio station events
 * @param ndk NDK instance
 * @param onEvent Callback for each event
 * @returns NDKSubscription
 */
export function subscribeToRadioStations(ndk: NDK, onEvent?: (event: NDKEvent) => void) {
    const filter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
    }

    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    })

    if (onEvent) {
        subscription.on('event', (event: NDKEvent) => {
            try {
                const parsed = parseRadioEvent(event)
                onEvent(event)
            } catch (e) {
                console.warn('Invalid radio event:', e)
            }
        })
    }

    return subscription
}

/**
 * Fetch all radio stations
 * @param ndk NDK instance
 * @returns Promise<NDKEvent[]>
 */
export async function fetchRadioStations(ndk: NDK): Promise<NDKEvent[]> {
    const filter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
        since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7, // Last 7 days
    }

    const events = await ndk.fetchEvents(filter)
    return Array.from(events).filter((event) => {
        try {
            parseRadioEvent(event)
            return true
        } catch {
            return false
        }
    })
}

export function stationToNostrEvent(station: Station): NostrEvent {
    let tags = [...station.tags]

    const existingDTag = tags.find((tag) => tag[0] === 'd')
    if (!existingDTag) {
        const newDTag = ['d', createStationDTagValue()]
        tags.push(newDTag)
    }

    // Add or update name and description tags
    const existingNameTag = tags.find((tag) => tag[0] === 'name')
    if (!existingNameTag) {
        tags.push(['name', station.name])
    }

    const existingDescTag = tags.find((tag) => tag[0] === 'description')
    if (!existingDescTag) {
        tags.push(['description', station.description])
    }

    return {
        kind: RADIO_EVENT_KINDS.STREAM,
        content: JSON.stringify({
            name: station.name,
            description: station.description,
            website: station.website,
            streams: station.streams,
        }),
        created_at: station.created_at,
        pubkey: station.pubkey,
        tags,
    }
}

/**
 * Fetch radio station by name from Nostr
 * @param ndk NDK instance
 * @param name Station name to search for
 * @returns Promise<NDKEvent | null> - Returns the matching station event or null if not found
 */
export async function findStationByNameInNostr(ndk: NDK, name: string): Promise<NDKEvent | null> {
    const filter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
        '#name': [name], // Filter by exact name tag match
    }

    const events = await ndk.fetchEvents(filter)

    // Return the first matching event or null if none found
    for (const event of events) {
        return event // Since we're filtering by exact name, the first match is good
    }

    // If no exact match found, try a case-insensitive search
    const fallbackFilter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
    }

    const allEvents = await ndk.fetchEvents(fallbackFilter)

    for (const event of allEvents) {
        try {
            // Check for case-insensitive name tag match
            const nameTag = event.tags.find((tag) => tag[0] === 'name')
            if (nameTag && nameTag[1].toLowerCase() === name.toLowerCase()) {
                return event
            }
        } catch {
            // Skip invalid events
            continue
        }
    }

    return null
}

/**
 * Generate a Nostr address (naddr) for a station event
 * @param event NDKEvent representing a station
 * @returns naddr string for the station
 */
export function generateStationNaddr(event: NDKEvent): string {
    // Get the d-tag value which is required for replaceable events
    const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1]
    if (!dTag) {
        throw new Error('Station event missing required d-tag')
    }

    // Create the naddr using nip19 from nostr-tools
    return nip19.naddrEncode({
        identifier: dTag,
        pubkey: event.pubkey,
        kind: RADIO_EVENT_KINDS.STREAM as number,
        relays: [],
    })
}

/**
 * Get the event parameters from an naddr
 * @param naddr The Nostr address (naddr) string
 * @returns The decoded naddr data
 */
export function decodeStationNaddr(naddr: string): {
    identifier: string
    pubkey: string
    kind: number
    relays?: string[]
} {
    if (!naddr.startsWith('naddr')) {
        throw new Error('Invalid naddr format, must start with "naddr"')
    }

    try {
        const { data } = nip19.decode(naddr)
        return data as {
            identifier: string
            pubkey: string
            kind: number
            relays?: string[]
        }
    } catch (error) {
        throw new Error(`Failed to decode naddr: ${error}`)
    }
}
