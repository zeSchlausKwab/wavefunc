import NDK, { NDKEvent, NDKKind, NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import type { NDKFilter, NostrEvent } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'
import type { Station } from '../types/station'
import { validateRadioStationEvent, parseRadioContent, RADIO_EVENT_KINDS } from '../schemas/events'
import { v4 as uuidv4 } from 'uuid'
import { ndkActions } from '../lib/store/ndk'
import { envActions } from '../lib/store/env'

// type RadioEventContent = z.infer<typeof RadioEventContentSchema>

/**
 * Creates a random 'd' tag value
 * @returns A random ID to use as d-tag value
 */
export function createStationDTagValue(): string {
    return uuidv4()
}

/**
 * Creates an unsigned radio station event following the SPEC.md format
 */
export function createRadioEvent(
    content: {
        description: string
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
        streamingServerUrl?: string
    },
    tags: string[][],
    existingTags?: string[][],
): NostrEvent {
    let newTags = [...tags]

    // Preserve the d-tag from existing tags if available
    if (existingTags) {
        const existingDTag = existingTags.find((tag) => tag[0] === 'd')
        newTags = newTags.filter((tag) => tag[0] !== 'd')

        if (existingDTag) {
            // Always keep the existing d-tag for replaceability
            newTags.push(existingDTag)
        } else {
            // If no existing d-tag, create a new UUID-like value
            const dValue = createStationDTagValue()
            newTags.push(['d', dValue])
        }
    } else {
        // For new events, we need to ensure there's a d-tag
        const hasDTag = newTags.some((tag) => tag[0] === 'd')
        if (!hasDTag) {
            // Always use a UUID-like value for new d-tags
            const dValue = createStationDTagValue()
            newTags.push(['d', dValue])
        }
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
 * Validates and parses a radio station event using schema validation
 * This is an improved version that uses our validation schemas
 * @param event The event to validate and parse
 * @returns The parsed radio station data
 * @throws Error if the event is invalid
 */
export function parseRadioEventWithSchema(event: NDKEvent | NostrEvent) {
    // Validate that this is a valid radio event
    const isValid = validateRadioStationEvent(event)
    if (!isValid) {
        throw new Error('Invalid radio station event format')
    }

    // Parse the content using our schema parser
    const content = parseRadioContent(event.content)
    if (!content) {
        throw new Error('Invalid radio station content')
    }

    // Extract tags
    const tags = event.tags as string[][]

    // Extract required metadata from tags
    const nameTag = tags.find((tag) => tag[0] === 'name')
    if (!nameTag) {
        throw new Error('Missing required name tag')
    }

    // Get various metadata from tags
    const genreTags = tags.filter((tag) => tag[0] === 't').map((tag) => tag[1])
    const websiteTag = tags.find((tag) => tag[0] === 'website')?.[1] || ''
    const countryCode = tags.find((tag) => tag[0] === 'countryCode')?.[1] || ''
    const languageCodes = tags.filter((tag) => tag[0] === 'l').map((tag) => tag[1])
    const location = tags.find((tag) => tag[0] === 'location')?.[1] || ''
    const thumbnail = tags.find((tag) => tag[0] === 'thumbnail')?.[1] || ''

    return {
        name: nameTag[1],
        description: content.description,
        website: websiteTag,
        streams: content.streams,
        streamingServerUrl: content.streamingServerUrl,
        countryCode: countryCode,
        languageCodes: languageCodes,
        tags: genreTags,
        location: location,
        thumbnail: thumbnail,
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

    // Prepare content object following SPEC.md
    const content: {
        description: string
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
        streamingServerUrl?: string
    } = {
        description: radioBrowserStation.name, // API doesn't have a description, use name as fallback
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
    }

    // Add streamingServerUrl if it exists in the RadioBrowser data
    if (radioBrowserStation.serverUrl) {
        content.streamingServerUrl = radioBrowserStation.serverUrl
    }

    // Generate a UUID-like d-tag value
    const dTagValue = createStationDTagValue()

    // Prepare tags array
    const tagsArray: string[][] = [
        ['name', radioBrowserStation.name],
        ['d', dTagValue], // Use UUID-like d-tag instead of name
    ]

    // Add genre/tags as t tags
    tags.forEach((tag: string) => {
        tagsArray.push(['t', tag])
    })

    // Add country code
    if (radioBrowserStation.countrycode) {
        tagsArray.push(['countryCode', radioBrowserStation.countrycode])
    }

    // Add language codes as individual l tags (not language)
    languageCodes.forEach((code: string) => {
        tagsArray.push(['l', code])
    })

    // Add favicon as thumbnail
    if (radioBrowserStation.favicon) {
        tagsArray.push(['thumbnail', radioBrowserStation.favicon])
    }

    // Add website
    if (radioBrowserStation.homepage) {
        tagsArray.push(['website', radioBrowserStation.homepage])
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

    // Create a subscription with specific options to prevent duplicate processing
    const subscription = ndk.subscribe(filter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    })

    if (onEvent) {
        subscription.on('event', (event: NDKEvent) => {
            try {
                // const parsed = parseRadioEvent(event)
                // console.dir(safeStringify(event), { depth: 2 })
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
            parseRadioEventWithSchema(event)
            return true
        } catch {
            return false
        }
    })
}

export function stationToNostrEvent(station: Station): NostrEvent {
    let tags = [...station.tags]

    // Ensure required tags are present
    const existingDTag = tags.find((tag) => tag[0] === 'd')
    if (!existingDTag) {
        // Use a UUID-like value for the d-tag instead of station name
        const dValue = createStationDTagValue()
        tags.push(['d', dValue])
    }

    const existingNameTag = tags.find((tag) => tag[0] === 'name')
    if (!existingNameTag) {
        tags.push(['name', station.name])
    }

    // Website tag
    if (station.website && !tags.some((tag) => tag[0] === 'website')) {
        tags.push(['website', station.website])
    }

    // Thumbnail tag
    if (station.imageUrl && !tags.some((tag) => tag[0] === 'thumbnail')) {
        tags.push(['thumbnail', station.imageUrl])
    }

    return {
        kind: RADIO_EVENT_KINDS.STREAM,
        content: JSON.stringify({
            description: station.description,
            streams: station.streams,
            ...(station.streamingServerUrl ? { streamingServerUrl: station.streamingServerUrl } : {}),
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
    // Search by name tag directly
    const nameFilter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
        '#name': [name],
    }
    const nameEvents = await ndk.fetchEvents(nameFilter)
    for (const event of nameEvents) {
        return event
    }

    // Fall back to more general search
    const fallbackFilter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
    }
    const allEvents = await ndk.fetchEvents(fallbackFilter, {
        closeOnEose: false,
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
    })
    for (const event of allEvents) {
        try {
            // Check 'name' tag case-insensitively
            const nameTag = event.tags.find((tag) => tag[0] === 'name')
            if (nameTag && nameTag[1].toLowerCase() === name.toLowerCase()) {
                return event
            }
        } catch {
            continue // Skip invalid events
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
 * @param naddr The Nostr address (naddr) string or raw format "kind:pubkey:identifier"
 * @returns The decoded naddr data
 */
export function decodeStationNaddr(naddr: string): {
    identifier: string
    pubkey: string
    kind: number
    relays?: string[]
} {
    if (!naddr.startsWith('naddr')) {
        const parts = naddr.split(':')
        if (parts.length < 3) {
            throw new Error('Invalid naddr format: should be either bech32 encoded or "kind:pubkey:identifier"')
        }

        return {
            kind: parseInt(parts[0]),
            pubkey: parts[1],
            identifier: parts[2],
            relays: [],
        }
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

/**
 * Create a NIP-89 handler event for our radio app
 * This declares our app as a handler for radio station events
 */
export function createHandlerEvent(): NostrEvent {
    const handlerId = Math.random().toString(36).substring(2, 14)

    return {
        kind: NDKKind.AppHandler,
        pubkey: envActions.getEnv()?.APP_PUBKEY || '',
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify({
            name: 'NostrRadio',
            display_name: 'Nostr Radio',
            picture: 'https://wavefunc.io/icons/logo.png',
            about: 'A radio station directory and player built on Nostr',
            nip90: {
                content: ['text/plain'],
            },
        }),
        tags: [
            ['d', handlerId],
            ['k', RADIO_EVENT_KINDS.STREAM.toString()],
            ['web', 'https://wavefunc.io/station/<bech32>', 'nevent'],
            ['web', 'https://wavefunc.io/stations', 'naddr'],
        ],
    }
}

/**
 * Publish a NIP-89 handler event
 * @param ndk NDK instance
 * @returns Promise<NDKEvent>
 */
export async function publishHandlerEvent(ndk: NDK): Promise<NDKEvent> {
    const event = createHandlerEvent()
    const ndkEvent = new NDKEvent(ndk, event)
    await ndkEvent.publish()
    return ndkEvent
}

/**
 * Create a client tag for identifying events published by this app
 * @param handlerEvent The handler event previously published
 * @param relayUrl Optional relay URL hint for finding the handler event
 * @returns The client tag to include when publishing events
 */
export function createClientTag(handlerEvent: NDKEvent, relayUrl?: string): string[] {
    const dTag = handlerEvent.tags.find((tag) => tag[0] === 'd')?.[1] || ''
    const clientId = `${NDKKind.AppHandler}:${envActions.getEnv()?.APP_PUBKEY || ''}:${dTag}`

    return ['client', 'NostrRadio', clientId, ...(relayUrl ? [relayUrl] : [])]
}

/**
 * Map a Nostr event to a properly formatted Station object with encoded naddr
 * @param event The Nostr event to map
 * @returns The formatted Station object with encoded naddr
 */
export function mapNostrEventToStation(event: NDKEvent | NostrEvent): Station {
    try {
        const stationData = parseRadioEventWithSchema(event)

        const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1]
        if (!dTag) {
            throw new Error('Station event missing required d-tag')
        }

        const naddr = nip19.naddrEncode({
            identifier: dTag,
            pubkey: event.pubkey,
            kind: RADIO_EVENT_KINDS.STREAM as number,
            relays: [],
        })

        return {
            id: typeof event.id === 'function' ? event.id : event.id || '',
            name: stationData.name,
            description: stationData.description,
            website: stationData.website || '',
            imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
            pubkey: event.pubkey,
            tags: event.tags as string[][],
            streams: stationData.streams,
            streamingServerUrl: stationData.streamingServerUrl,
            created_at: event.created_at || Math.floor(Date.now() / 1000),
            countryCode: stationData.countryCode,
            languageCodes: stationData.languageCodes,
            naddr: naddr,
            event: event as NDKEvent,
        }
    } catch (error) {
        console.error('Error mapping event to station:', error)
        throw error
    }
}

/**
 * Searches for radio stations based on search criteria
 * @param ndk NDK instance
 * @param options Search options
 * @returns Promise<Station[]>
 */
export async function searchRadioStations(
    ndk: NDK,
    options: {
        searchTerm?: string
        tags?: string[]
        languageCode?: string
        domain?: string
        since?: number
        until?: number
        authors?: string[]
    } = {},
): Promise<Station[]> {
    const searchNdk = ndkActions.getSearchNdk()
    if (!searchNdk) {
        throw new Error('Search NDK instance not available')
    }

    const { searchTerm, tags, languageCode, domain, since, until, authors } = options

    // Base filter for radio station events
    const filter: NDKFilter = {
        kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
        limit: 10,
    }

    // Add time range filters if provided
    if (since) {
        filter.since = since
    }

    if (until) {
        filter.until = until
    }

    // Add author filter if provided
    if (authors && authors.length > 0) {
        filter.authors = authors
    }

    // Build search string with NIP-50 extensions
    let searchString = ''

    // Add the main search term if provided
    if (searchTerm && searchTerm.trim()) {
        searchString = searchTerm.trim()
    }

    // Add language extension if provided
    if (languageCode) {
        searchString += ` language:${languageCode}`
    }

    // Add domain extension if provided
    if (domain) {
        searchString += ` domain:${domain}`
    }

    // Add the search to the filter if we have any search terms or extensions
    if (searchString.trim()) {
        filter.search = searchString.trim()
    }

    // Add tag filters if provided and we're not using search
    // (because tags are already supported in Bluge search)
    if (tags && tags.length > 0) {
        filter['#t'] = tags
    }

    console.log('🔎 NIP-50 Search filter:', JSON.stringify(filter, null, 2))

    try {
        console.log(
            '📻 Connected relays:',
            Array.from(searchNdk.pool?.relays.values() || [])
                .map((r) => `${r.url} (${r.status})`)
                .join(', '),
        )

        const events = await searchNdk.fetchEvents(filter)
        const stations: Station[] = []

        console.log(`🔔 Received ${events.size} events from search`)

        for (const event of events) {
            try {
                const station = mapNostrEventToStation(event)
                stations.push(station)
            } catch (error) {
                console.warn('Invalid station event:', error)
            }
        }

        console.log(`✅ Successfully mapped ${stations.length} stations`)
        return stations
    } catch (error) {
        console.error('❌ Error searching for stations:', error)
        throw error
    }
}

export async function fetchStation(ndk: NDK, naddr: string): Promise<Station | null> {
    if (!ndk) {
        throw new Error('NDK instance not available')
    }

    try {
        const nadrData = decodeStationNaddr(naddr)
        const filter = {
            kinds: [nadrData.kind],
            authors: [nadrData.pubkey],
            '#d': [nadrData.identifier],
        }

        const event = await ndk.fetchEvent(filter)
        if (!event) {
            return null
        }

        return mapNostrEventToStation(event)
    } catch (error) {
        console.error('[Station] Error:', error)
        throw error
    }
}
