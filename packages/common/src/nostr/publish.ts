import NDK, { NDKEvent, type NostrEvent } from '@nostr-dev-kit/ndk'
import { RADIO_EVENT_KINDS, createRadioEvent } from './radio'
import type { Station } from '../types/station'

/**
 * Publish a new radio station event
 */
export async function publishStation(ndk: NDK, event: NostrEvent): Promise<NDKEvent> {
    if (event.kind !== RADIO_EVENT_KINDS.STREAM) {
        throw new Error('Invalid event kind. Expected radio stream event.')
    }

    // Ensure station content has name and description in tags
    try {
        const content = JSON.parse(event.content)

        // Check if name tag exists, otherwise add it
        if (!event.tags.some((tag) => tag[0] === 'name') && content.name) {
            event.tags.push(['name', content.name])
        }

        // Check if description tag exists, otherwise add it
        if (!event.tags.some((tag) => tag[0] === 'description') && content.description) {
            event.tags.push(['description', content.description])
        }

        // Check if indexed identity tag exists, otherwise add it
        if (!event.tags.some((tag) => tag[0] === 'i') && content.name) {
            event.tags.push(['i', content.name.trim()])
        }
    } catch (error) {
        console.error('Failed to parse event content:', error)
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
        genre?: string
        imageUrl?: string
        countryCode?: string
        languageCodes?: string[]
        tags?: string[]
    },
): Promise<NDKEvent> {
    // Create the basic tags array - put d-tag first to emphasize its importance
    const tags = [
        ['name', updatedData.name],
        ['description', updatedData.description],
        ['genre', updatedData.genre || ''],
        ['thumbnail', updatedData.imageUrl || ''],
        ['client', 'nostr_radio'],
        ['i', updatedData.name.trim()], // Add indexed identity tag
    ]

    // Add countryCode if provided
    if (updatedData.countryCode) {
        tags.push(['countryCode', updatedData.countryCode])
    }

    // Add language codes as individual language tags
    if (updatedData.languageCodes && updatedData.languageCodes.length > 0) {
        updatedData.languageCodes.forEach((code) => {
            if (code.trim()) {
                tags.push(['language', code.trim()])
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

    // Create a radio event that preserves the existing tags (including d-tag)
    const event = createRadioEvent(
        {
            name: updatedData.name,
            description: updatedData.description,
            website: updatedData.website,
            streams: updatedData.streams,
            countryCode: updatedData.countryCode,
            languageCodes: updatedData.languageCodes,
            tags: updatedData.tags,
        },
        tags,
        station.tags, // Pass existing tags to preserve 'd' tag
    )

    // Create and publish the NDK event
    const ndkEvent = new NDKEvent(ndk, event)
    await ndkEvent.publish()

    return ndkEvent
}

/**
 * Publish multiple radio stations
 */
export async function publishStations(ndk: NDK, events: NostrEvent[]): Promise<NDKEvent[]> {
    // Ensure each event has the station name as d-tag
    const preparedEvents = events.map((event) => {
        try {
            const content = JSON.parse(event.content)
            if (content.name) {
                // Remove any existing d-tag
                event.tags = event.tags.filter((tag) => tag[0] !== 'd')
                // Add d-tag with station name
                event.tags.push(['d', content.name.trim()])
            }
        } catch (e) {
            console.error('Error preparing event for publishing:', e)
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
            ['a', 'nostr_radio'], // Include app tag for tracking
        ],
        content: 'Deleted radio station',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
    })

    await deleteEvent.publish()
    return deleteEvent
}
