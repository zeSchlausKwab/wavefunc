import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import * as dotenv from 'dotenv'
import { nip19 } from 'nostr-tools'

// Load .env
dotenv.config({ path: '../.env' })

// Get admin credentials
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY
const APP_PUBKEY = process.env.APP_PUBKEY || ''

const DEFAULT_RELAYS = [
    'ws://localhost:3002',
    // 'wss://relay.wavefunc.live',
    // 'wss://relay.nostr.band',
    // 'wss://nos.lol',
    // 'wss://relay.nostr.net',
    // 'wss://relay.damus.io',
]

if (!APP_PRIVATE_KEY) {
    throw Error('Missing APP_PRIVATE_KEY in .env!')
}

if (!APP_PUBKEY) {
    throw Error('Missing APP_PUBKEY in .env!')
}

// Handler ID - used for replaceable events
const handlerId = 'wavefuncstationshandler'

// Process command line arguments
const args = process.argv.slice(2)
const useLiveRelay = args.includes('--live')
const useDirectPublish = args.includes('--direct')
const publishFeatured = args.includes('--featured')

// Get relay URL from environment or use default
const relayUrls = useLiveRelay
    ? process.env.VITE_PUBLIC_RELAY_URL
        ? [process.env.VITE_PUBLIC_RELAY_URL]
        : DEFAULT_RELAYS
    : ['ws://localhost:3002'] // Default to local relay for testing

// For display purposes
const primaryRelayUrl = relayUrls[0]

// API endpoint URL
const apiEndpoint = useLiveRelay
    ? 'https://relay.wavefunc.live/admin/publish-handler'
    : 'http://localhost:3002/admin/publish-handler'

// Setup NDK with a signer for proper Nostr signatures
const signer = new NDKPrivateKeySigner(APP_PRIVATE_KEY)
const ndk = new NDK({
    explicitRelayUrls: relayUrls,
    signer,
})

/**
 * NIP-89 Handler Information
 *
 * This defines a handler for radio station events (kind 31237) according to NIP-89
 * https://github.com/nostr-protocol/nips/blob/master/89.md
 *
 * Key fields:
 * - name: Identifier for the application
 * - display_name: Human-readable name
 * - picture: Application icon/logo
 * - about: Description of the application
 *
 * Tags:
 * - d: Unique identifier for the handler (replaceable)
 * - k: Event kind(s) this handler can process (31237 for radio stations)
 * - web: URL templates for opening the app with various Nostr identifiers
 */
const handlerContent = {
    // Application identity
    name: 'NostrRadio', // Required: Identifier name
    display_name: 'Wavefunc Radio', // Required: Human-readable name
    picture: 'https://wavefunc.live/images/logo.png', // Required: App icon URL
    about: 'A radio station directory and player built on Nostr', // Required: Description

    // NIP-90 capabilities (optional)
    nip90: {
        content: ['text/plain'],
    },
}

/**
 * Kind 0 Metadata (Profile) Content
 *
 * According to NIP-01, kind 0 events contain profile/metadata information.
 * https://github.com/nostr-protocol/nips/blob/master/01.md
 *
 * We'll use a subset of the handler information for the profile.
 */
const profileContent = {
    name: handlerContent.display_name,
    display_name: handlerContent.display_name,
    picture: handlerContent.picture,
    about: handlerContent.about,
    website: 'https://wavefunc.live',
    nip05: 'Wavefunc@wavefunc.live', // NIP-05 verification
}

/**
 * Featured Station Lists
 *
 * These are curated collections of radio stations grouped by theme, genre, mood,
 * or other organizing principles. Each list uses kind 30078 with the 'featured_station_list' label.
 */
const featuredLists = [
    {
        name: 'Psych, Alternative, and Indie',
        description: 'The finest psych, alternative, and indie radio stations from around the world',
        topic: 'psych-alternative-indie',
        image: 'https://images.wallpaperscraft.ru/image/single/gitarist_muzykant_kontsert_122198_1920x1080.jpg',
        tags: ['psych', 'alternative', 'indie', 'featured'],
        stations: [
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:b57e54bd-98d1-411a-a974-54b8ab02b4b8',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'Bagel Radio',
                order: '1',
            },
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:a4aac190-6ef9-407a-99a4-9a900a766440',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'Guerrilla Radio',
                order: '2',
            },
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:bc7c8c5e-0e2f-4c86-b301-05d61d45595c',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'Fip Rock',
                order: '3',
            },
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:05c826f8-95e7-41f0-893e-c1c4f48fcd05',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'Braintrip',
                order: '4',
            },
        ],
    },
    {
        name: 'Drone & Ambient',
        description: 'Beautiful drone and ambient music stations for focus and relaxation',
        topic: 'drone-ambient',
        image: 'https://images.wallpaperscraft.ru/image/single/gitarist_muzykant_kontsert_122198_1920x1080.jpg',
        tags: ['drone', 'ambient', 'featured'],
        stations: [
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:19bd53ab-f110-4ce9-9d23-c3d28432f2b1',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'SomaFM Drone Zone',
                order: '1',
            },
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:0fe91134-696a-42f9-b911-7a1528752fef',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'SomaFMDeep Space One',
                order: '2',
            },
        ],
    },
    {
        name: 'Electro & IDM',
        description: 'Electronic beats and rhythms to get you moving',
        topic: 'electronic',
        image: 'https://images.wallpaperscraft.ru/image/single/gitarist_muzykant_kontsert_122198_1920x1080.jpg',
        tags: ['electronic', 'dance', 'techno', 'house', 'featured'],
        stations: [
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:6dd1d6ff-daea-4fdc-865d-590929febd39',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'SomaFM CliqHop IDM',
                order: '1',
            },
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:2470f399-4883-44fb-8eb4-f54a6df61e72',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'Fip Electro',
                order: '2',
            },
            {
                event_id:
                    '31237:210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2:ca317de1-c2aa-4b08-aaad-aaa25542319a',
                relay_url: 'wss://relay.wavefunc.live',
                display_name: 'Radio Caprice - Electro',
                order: '3',
            },
        ],
    },
]

/**
 * Publish events through the admin API endpoint
 */
async function publishEventThroughAPI(event: NDKEvent): Promise<any> {
    console.log(`Publishing event through API: ${apiEndpoint}`)

    // Get the raw signed event
    const rawEvent = event.rawEvent()

    try {
        // Make the API call
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Pubkey': APP_PUBKEY,
                'X-Admin-Timestamp': new Date().toISOString(),
                // Note: in a production environment, you would sign this request
                // But for simplicity, we're relying on the event's signature
            },
            body: JSON.stringify(rawEvent),
        })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`API call failed: ${response.status} - ${errorText}`)
        }

        return await response.json()
    } catch (error) {
        console.error('Error publishing through API:', error)
        throw error
    }
}

/**
 * Create a featured station list event
 */
async function createFeaturedListEvent(listData: (typeof featuredLists)[0]): Promise<NDKEvent> {
    const featuredEvent = new NDKEvent(ndk)
    featuredEvent.kind = 30078 // Same kind as favorites lists

    // Create content object
    const content = {
        name: listData.name,
        description: listData.description,
        topic: listData.topic,
        image: listData.image,
    }

    featuredEvent.content = JSON.stringify(content)

    // Set required tags according to SPEC.md
    featuredEvent.tags = [
        // d-tag for unique identifier, using topic as the value for predictability
        ['d', listData.topic],

        // l-tag specifies this is a featured list (not a user favorites list)
        ['l', 'featured_station_list'],

        // Basic metadata tags
        ['name', listData.name],
        ['description', listData.description],
        ['topic', listData.topic],

        // Add the genre/category tags
        ...listData.tags.map((tag) => ['t', tag]),

        // Add attribution
        ['p', APP_PUBKEY],
    ]

    // Add station references as 'a' tags
    // Format: ['a', event_id, relay_url?, display_name?, order?]
    listData.stations.forEach((station) => {
        featuredEvent.tags.push([
            'a',
            station.event_id,
            station.relay_url || '',
            station.display_name || '',
            station.order || '',
        ])
    })

    // Sign the event
    await featuredEvent.sign()

    return featuredEvent
}

/**
 * Publish featured station lists
 */
async function publishFeaturedLists(): Promise<void> {
    console.log(`\nPublishing ${featuredLists.length} featured station lists...`)

    for (const listData of featuredLists) {
        try {
            console.log(`\nCreating featured list: "${listData.name}"`)
            const featuredEvent = await createFeaturedListEvent(listData)

            // Publish the event
            let result
            if (useDirectPublish) {
                console.log('Directly publishing featured list...')
                await featuredEvent.publish()
                result = { success: true, event_id: featuredEvent.id }
            } else {
                console.log('Publishing featured list through API...')
                result = await publishEventThroughAPI(featuredEvent)
            }

            // Print the published event information
            console.log(`\nFeatured list event (kind 30078):`)
            console.log(`Event ID: ${featuredEvent.id}`)
            console.log(`Topic: ${listData.topic}`)
            console.log(`Stations: ${listData.stations.length}`)
            console.log(`Status: ${result.success ? 'Published' : 'Failed'}`)
        } catch (error) {
            console.error(`Failed to publish featured list "${listData.name}":`, error)
        }
    }
}

/**
 * Publish a NIP-89 handler information event and a kind 0 metadata event
 */
async function publishHandlerEvent(): Promise<void> {
    try {
        console.log(`Connecting to relays: ${relayUrls.join(', ')}`)
        await ndk.connect()

        // Create a NIP-89 handler event (kind 31990)
        const handlerEvent = new NDKEvent(ndk)
        handlerEvent.kind = 31990
        handlerEvent.content = JSON.stringify(handlerContent)

        // Set required tags according to NIP-89
        handlerEvent.tags = [
            // d-tag makes the event replaceable and provides a stable identifier
            ['d', handlerId],

            // k-tag specifies which event kinds this handler can process
            ['k', '31237'], // Radio station events

            // web-tags provide URL templates for opening the application with Nostr identifiers
            // Format: ["web", "<url-with-placeholder>", "<identifier-type>"]
            ['web', 'https://wavefunc.live/station/<bech32>', 'naddr'], // For a specific station
            ['web', 'https://wavefunc.live/profile/<bech32>', 'npub'], // For browsing stations
        ]

        // Sign the event (this sets the ID and signature)
        await handlerEvent.sign()

        // Create a kind 0 metadata event
        const metadataEvent = new NDKEvent(ndk)
        metadataEvent.kind = 0
        metadataEvent.content = JSON.stringify(profileContent)

        // Metadata events don't require tags, but we can add some helpful ones
        metadataEvent.tags = [['r', 'https://relay.wavefunc.live']]

        // Sign the metadata event
        await metadataEvent.sign()

        // Publish the events
        let handlerResult, metadataResult

        if (useDirectPublish) {
            // Publish directly to the relay
            console.log('Directly publishing handler event (kind 31990)...')
            await handlerEvent.publish()
            handlerResult = { success: true, event_id: handlerEvent.id }

            console.log('Directly publishing metadata event (kind 0)...')
            await metadataEvent.publish()
            metadataResult = { success: true, event_id: metadataEvent.id }
        } else {
            // Publish through the API
            console.log('Publishing handler event (kind 31990) through API...')
            handlerResult = await publishEventThroughAPI(handlerEvent)

            console.log('Publishing metadata event (kind 0) through API...')
            metadataResult = await publishEventThroughAPI(metadataEvent)
        }

        // Print the published handler event information
        console.log('\nHandler event (kind 31990):')
        console.log(`Handler ID: ${handlerId}`)
        console.log(`Event ID: ${handlerEvent.id}`)
        console.log(`Public Key: ${handlerEvent.pubkey}`)
        console.log(`Event URL: nostr:${handlerEvent.encode()}`)
        console.log(`Status: ${handlerResult.success ? 'Published' : 'Failed'}`)

        // Print the published metadata event information
        console.log('\nMetadata event (kind 0):')
        console.log(`Event ID: ${metadataEvent.id}`)
        console.log(`Status: ${metadataResult.success ? 'Published' : 'Failed'}`)

        // If requested, also publish featured lists
        if (publishFeatured) {
            await publishFeaturedLists()
        }

        console.log(`\nPrimary Relay: ${primaryRelayUrl}`)
        console.log('API Endpoint: ' + apiEndpoint)
        console.log('Publication method: ' + (useDirectPublish ? 'Direct to relay' : 'Through API'))

        console.log('\nFull handler event data:')
        console.log(JSON.stringify(handlerEvent.rawEvent(), null, 2))

        console.log('\nFull metadata event data:')
        console.log(JSON.stringify(metadataEvent.rawEvent(), null, 2))

        console.log('\nUsage instructions:')
        console.log('- To update these events, run the same command with the same handler ID:')

        let cmdParams = handlerId
        if (useLiveRelay) cmdParams += ' --live'
        if (useDirectPublish) cmdParams += ' --direct'
        if (publishFeatured) cmdParams += ' --featured'

        console.log(`  bun publish:handler ${cmdParams}`)
        console.log('- To check if your handler is published, open a Nostr client and look for events with:')
        console.log(`  kind:31990 author:${handlerEvent.pubkey} #d:${handlerId}`)
        console.log('- To see the profile, look for:')
        console.log(`  kind:0 author:${metadataEvent.pubkey}`)
        console.log('- To see the featured lists, look for:')
        console.log(`  kind:30078 #l:featured_station_list author:${APP_PUBKEY}`)
    } catch (error) {
        console.error('Failed to publish events:', error)
    } finally {
        process.exit(0)
    }
}

console.log(`
Publishing Nostr Events for Wavefunc Radio
------------------------------------------
Handler ID: ${handlerId}
Relay URLs: ${relayUrls.join(', ')}
API Endpoint: ${apiEndpoint}
Publication method: ${useDirectPublish ? 'Direct to relay' : 'Through API'}
Events to publish:
- kind:31990 (NIP-89 Handler)
- kind:0 (Metadata/Profile)
${publishFeatured ? '- kind:30078 (Featured Station Lists)' : ''}
`)

// Run the publisher
publishHandlerEvent().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
})
