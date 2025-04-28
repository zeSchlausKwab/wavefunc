import NDK, { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk'
import { RADIO_EVENT_KINDS } from '../schemas/events'
import type { Station } from '../types/station'
import { createStationDTagValue } from './radio'

/**
 * Publish a new radio station event
 */
export async function publishStation(ndk: NDK, event: NostrEvent, clientTag?: string[]): Promise<NDKEvent> {
    if (event.kind !== RADIO_EVENT_KINDS.STREAM) {
        throw new Error('Invalid event kind. Expected radio stream event.')
    }

    // Ensure required tags are present
    try {
        // Ensure name tag exists
        if (!event.tags.some((tag) => tag[0] === 'name')) {
            throw new Error('Missing required name tag')
        }

        // Ensure d-tag exists, create a UUID-like value if missing
        if (!event.tags.some((tag) => tag[0] === 'd')) {
            // Generate a UUID-like value for the d-tag, completely independent of the name
            const dValue = createStationDTagValue()
            event.tags.push(['d', dValue])
        }

        // Add client tag if provided
        if (clientTag && !event.tags.some((tag) => tag[0] === 'client')) {
            event.tags.push(clientTag)
        }

        // Validate content structure
        try {
            const content = JSON.parse(event.content)
            if (
                !content.description ||
                !content.streams ||
                !Array.isArray(content.streams) ||
                content.streams.length === 0
            ) {
                throw new Error('Invalid content structure: missing description or streams')
            }
        } catch (error: any) {
            throw new Error(`Invalid content JSON: ${error.message}`)
        }
    } catch (error) {
        console.error('Failed to prepare event:', error)
        throw error
    }

    const ndkEvent = new NDKEvent(ndk, event)
    await ndkEvent.publish()
    return ndkEvent
}

/**
 * Update an existing radio station
 * This ensures the d-tag is preserved for proper replaceable event handling
 */
export async function updateStation(
    ndk: NDK,
    station: Station,
    updatedData: {
        name: string
        description: string
        website: string
        streams: any[]
        thumbnail?: string
        countryCode?: string
        languageCodes?: string[]
        tags?: string[]
        location?: string
    },
    clientTag?: string[],
): Promise<NDKEvent> {
    // Get existing d-tag or create a new UUID-like one
    let dTagValue: string
    const existingDTag = station.tags.find((tag) => tag[0] === 'd')?.[1]

    if (existingDTag) {
        // Always use existing d-tag if it exists to maintain replaceability
        dTagValue = existingDTag
    } else {
        // Create a new UUID-like d-tag if none exists
        dTagValue = createStationDTagValue()
    }

    // Create the tags array - required tags first
    const tags = [
        ['d', dTagValue], // Use UUID-like d-tag
        ['name', updatedData.name],
    ]

    // Add recommended tags
    // Add thumbnail if provided
    if (updatedData.thumbnail) {
        tags.push(['thumbnail', updatedData.thumbnail])
    }

    // Add website if provided
    if (updatedData.website) {
        tags.push(['website', updatedData.website])
    }

    // Add location if provided
    if (updatedData.location) {
        tags.push(['location', updatedData.location])
    }

    // Add countryCode if provided
    if (updatedData.countryCode) {
        tags.push(['countryCode', updatedData.countryCode])
    }

    // Add language codes as individual 'l' tags
    if (updatedData.languageCodes && updatedData.languageCodes.length > 0) {
        updatedData.languageCodes.forEach((code) => {
            if (code.trim()) {
                tags.push(['l', code.trim()])
            }
        })
    }

    // Add tags as t tags
    if (updatedData.tags && updatedData.tags.length > 0) {
        updatedData.tags.forEach((tag) => {
            if (tag.trim()) {
                tags.push(['t', tag.trim()])
            }
        })
    }

    // Add client tag if provided
    if (clientTag) {
        tags.push(clientTag)
    }

    // Create the content object according to SPEC.md
    const content = {
        description: updatedData.description,
        streams: updatedData.streams,
    }

    // Create an NDK event and publish it
    const ndkEvent = new NDKEvent(ndk, {
        kind: RADIO_EVENT_KINDS.STREAM,
        tags: tags,
        content: JSON.stringify(content),
        created_at: Math.floor(Date.now() / 1000),
    })

    await ndkEvent.publish()
    return ndkEvent
}

/**
 * Publish multiple radio stations
 */
export async function publishStations(ndk: NDK, events: NostrEvent[], clientTag?: string[]): Promise<NDKEvent[]> {
    // Prepare events according to SPEC.md
    const preparedEvents = events.map((event) => {
        // Check for required tags
        if (!event.tags.some((tag) => tag[0] === 'name')) {
            throw new Error('Missing required name tag')
        }

        // Create a UUID-like d-tag, completely independent of the name
        // Remove any existing d-tag
        event.tags = event.tags.filter((tag) => tag[0] !== 'd')
        // Add new UUID-like d-tag
        const dValue = createStationDTagValue()
        event.tags.push(['d', dValue])

        // Add client tag if provided
        if (clientTag && !event.tags.some((tag) => tag[0] === 'client')) {
            event.tags.push(clientTag)
        }

        return event
    })

    const publishPromises = preparedEvents.map((event) => publishStation(ndk, event))
    return Promise.all(publishPromises)
}

/**
 * Delete a radio station
 */
export async function deleteStation(ndk: NDK, eventId: string): Promise<NDKEvent> {
    const deleteEvent = new NDKEvent(ndk, {
        kind: 5, // Deletion event kind
        tags: [
            ['e', eventId], // Reference to the event being deleted
        ],
        content: 'Deleted radio station',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
    })

    await deleteEvent.publish()
    return deleteEvent
}
