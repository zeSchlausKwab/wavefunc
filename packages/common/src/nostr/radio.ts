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
        // New fields from radio-browser.info
        countryCode?: string // ISO 3166-2 country code
        languageCodes?: string[] // ISO language codes
        tags?: string[]
        favicon?: string
        // TODO: Implement proper UI for geo data in the future
        // geo?: {
        //     lat?: number
        //     long?: number
        // }
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

    // Add new tags for additional metadata
    if (content.countryCode && !newTags.some((tag) => tag[0] === 'countryCode')) {
        newTags.push(['countryCode', content.countryCode])
    }

    // Add language codes as individual language tags
    if (content.languageCodes && content.languageCodes.length > 0) {
        content.languageCodes.forEach((code) => {
            if (code.trim()) {
                newTags.push(['language', code.trim()])
            }
        })
    }

    // Add tags as individual t tags
    if (content.tags && content.tags.length > 0) {
        content.tags.forEach((tag) => {
            if (tag.trim()) {
                newTags.push(['t', tag.trim()])
            }
        })
    }

    // Add favicon as thumbnail if not already present
    if (content.favicon && !newTags.some((tag) => tag[0] === 'thumbnail')) {
        newTags.push(['thumbnail', content.favicon])
    }

    // Add geolocation
    if (content.geo && content.geo.lat && content.geo.long) {
        // TODO: Geolocation support is reserved for future implementation
        newTags.push(['g', `${content.geo.lat},${content.geo.long}`])
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

    // Extract tags
    const tags = event.tags as string[][]
    const tagsArray = tags.filter((tag) => tag[0] === 't').map((tag) => tag[1])

    // Extract country code and language codes from tags
    const countryCode = tags.find((tag) => tag[0] === 'countryCode')?.[1]

    // Get all language tags and collect their values
    const languageCodes = tags.filter((tag) => tag[0] === 'language').map((tag) => tag[1])

    // Extract geolocation if available
    const geoTag = tags.find((tag) => tag[0] === 'g')?.[1]
    // TODO: Geolocation data is extracted but UI implementation is pending
    const geo = geoTag
        ? {
              lat: parseFloat(geoTag.split(',')[0]),
              long: parseFloat(geoTag.split(',')[1]),
          }
        : undefined

    return {
        name: content.name,
        description: content.description,
        website: content.website,
        streams: content.streams,
        countryCode: countryCode || content.countryCode,
        languageCodes: languageCodes.length > 0 ? languageCodes : content.languageCodes,
        tags: tagsArray.length > 0 ? tagsArray : content.tags,
        geo: geo || content.geo,
        eventTags: tags,
    }
}

/**
 * Convert station from radio-browser.info format to our format
 * @param radioBrowserStation Station data from radio-browser.info API
 * @returns Station in our format
 */
export function convertFromRadioBrowser(radioBrowserStation: any): {
    content: any
    tags: string[][]
} {
    // Extract tags from comma-separated string
    const tags = radioBrowserStation.tags
        ? radioBrowserStation.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter(Boolean)
        : []

    // Extract language codes from comma-separated string
    const languageCodes = radioBrowserStation.languagecodes
        ? radioBrowserStation.languagecodes
              .split(',')
              .map((l: string) => l.trim())
              .filter(Boolean)
        : []

    // Prepare content object
    const content: {
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
            primary: boolean
        }[]
        countryCode: string
        languageCodes: string[]
        tags: string[]
        favicon: string
        geo?: {
            lat: number
            long: number
        }
    } = {
        name: radioBrowserStation.name,
        description: radioBrowserStation.name, // API doesn't have a description, use name as fallback
        website: radioBrowserStation.homepage || '',
        streams: [
            {
                url: radioBrowserStation.url_resolved || radioBrowserStation.url,
                format: radioBrowserStation.codec ? `audio/${radioBrowserStation.codec.toLowerCase()}` : 'audio/mpeg',
                quality: {
                    bitrate: radioBrowserStation.bitrate || 128000,
                    codec: radioBrowserStation.codec || 'mp3',
                    sampleRate: 44100, // Not provided by API, use default
                },
                primary: true,
            },
        ],
        countryCode: radioBrowserStation.countrycode || '',
        languageCodes,
        tags,
        favicon: radioBrowserStation.favicon || '',
    }

    // Prepare tags array
    const tagsArray: string[][] = [['name', content.name]]

    // Add description tag (using name as fallback)
    tagsArray.push(['description', content.description])

    // Add genre/tags as t tags
    tags.forEach((tag: string) => {
        tagsArray.push(['t', tag])
    })

    // Add country code
    if (content.countryCode) {
        tagsArray.push(['countryCode', content.countryCode])
    }

    // Add language codes as individual language tags
    if (languageCodes.length > 0) {
        languageCodes.forEach((code: string) => {
            tagsArray.push(['language', code])
        })
    }

    // Add favicon as thumbnail
    if (content.favicon) {
        tagsArray.push(['thumbnail', content.favicon])
    }

    // Add geolocation if available
    if (radioBrowserStation.geo_lat && radioBrowserStation.geo_long) {
        // TODO: Geolocation data from radio-browser.info will be used in future UI enhancements
        tagsArray.push(['g', `${radioBrowserStation.geo_lat},${radioBrowserStation.geo_long}`])

        // Add to content as well
        content.geo = {
            lat: radioBrowserStation.geo_lat,
            long: radioBrowserStation.geo_long,
        }
    }

    return {
        content,
        tags: tagsArray,
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
