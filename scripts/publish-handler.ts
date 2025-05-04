import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import * as dotenv from 'dotenv'
import { nip19 } from 'nostr-tools'

// Load .env
dotenv.config({ path: '../.env' })

// Get admin credentials
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY
const APP_PUBKEY = process.env.APP_PUBKEY || ''

const DEFAULT_RELAYS = [
    'wss://relay.wavefunc.live',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.nostr.net',
    'wss://relay.damus.io',
]

if (!APP_PRIVATE_KEY) {
    throw Error('Missing APP_PRIVATE_KEY in .env!')
}

if (!APP_PUBKEY) {
    throw Error('Missing APP_PUBKEY in .env!')
}

// Process command line arguments
const args = process.argv.slice(2)
const useLiveRelay = args.includes('--live')
const useDirectPublish = args.includes('--direct')

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
            ['d', 'wavefuncstationshandler'],

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
        metadataEvent.tags = [['r', 'https://wavefunc.live']]

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

        console.log(`  bun publish:handler ${cmdParams}`)
        console.log('- To check if your handler is published, open a Nostr client and look for events with:')
        console.log(`  kind:31990 author:${handlerEvent.pubkey} #d:${handlerId}`)
        console.log('- To see the profile, look for:')
        console.log(`  kind:0 author:${metadataEvent.pubkey}`)
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
`)

// Run the publisher
publishHandlerEvent().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
})
