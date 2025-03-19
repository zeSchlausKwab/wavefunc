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
    },
): Promise<NDKEvent> {
    // Create the basic tags array
    const tags = [
        ['name', updatedData.name],
        ['description', updatedData.description],
        ['genre', updatedData.genre || ''],
        ['thumbnail', updatedData.imageUrl || ''],
        ['client', 'nostr_radio'],
    ]

    // Create a radio event that preserves the existing tags (including d-tag)
    const event = createRadioEvent(
        {
            name: updatedData.name,
            description: updatedData.description,
            website: updatedData.website,
            streams: updatedData.streams,
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
    const publishPromises = events.map((event) => publishStation(ndk, event))
    return Promise.all(publishPromises)
}

/**
 * Delete a radio station
 */
export async function deleteStation(ndk: NDK, eventId: string): Promise<NDKEvent> {
    const deleteEvent = new NDKEvent(ndk, {
        kind: 5,
        tags: [['e', eventId]],
        content: 'Deleted radio station',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
    })

    await deleteEvent.publish()
    return deleteEvent
}
