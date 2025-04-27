import NDK from '@nostr-dev-kit/ndk'
import { fetchProfileByPubkey, getDisplayName, getProfileDescription } from '@wavefunc/common/src/nostr/profile'
import { fetchStationByNaddr } from '@wavefunc/common/src/nostr/radio'

/**
 * Get NDK instance
 * This is a simple function to create an NDK instance for use in the server
 */
function getNDK() {
    return new NDK({
        explicitRelayUrls: [
            'wss://relay.damus.io',
            'wss://nos.lol',
            'wss://relay.nostr.band',
            'wss://relay.wavefunc.live',
            // 'ws://192.168.0.188:3002',
        ],
    })
}

/**
 * Generate OpenGraph meta tags based on the route
 * Returns only the meta tags to be injected into the HTML
 */
export async function generateOpenGraphTags(req: Request): Promise<string> {
    const url = new URL(req.url)
    const path = url.pathname
    let title = 'Wavefunc'
    let description = 'A decentralized nostr app'
    let image = `${new URL('/images/og-image.png', req.url).href}`

    console.log(`Generating OG tags for: ${path}`)

    const stationMatch = path.match(/^\/station\/([^\/]+)/)
    const profileMatch = path.match(/^\/profile\/([^\/]+)/)

    if (stationMatch) {
        const stationId = stationMatch[1]

        title = `Station | Wavefunc`
        description = `Listen to this station on Wavefunc`

        try {
            const ndk = getNDK()
            await ndk.connect()
            console.log(`Connected to relays`, ndk)
            const station = await fetchStationByNaddr(ndk, stationId)

            if (station) {
                title = `${station.name} | Wavefunc Radio`
                description = station.description || `Listen to ${station.name} on Wavefunc`

                if (station.imageUrl) {
                    image = station.imageUrl
                }

                console.log(`Enhanced OG metadata with station data: ${station.name}`)
            } else {
                console.log(`Station not found for naddr: ${stationId}`)
                title = `Station ${stationId.substring(0, 6)}... | Wavefunc`
            }
        } catch (error) {
            console.error(`Error fetching station metadata:`, error)
        }
    } else if (profileMatch) {
        const profileId = profileMatch[1]

        title = `Nostr Profile | Wavefunc`
        description = `Check out this profile on Wavefunc`

        try {
            const ndk = getNDK()
            await ndk.connect()
            const profile = await fetchProfileByPubkey(ndk, profileId)

            if (profile) {
                const displayName = getDisplayName(profile)
                title = `${displayName} | Wavefunc`
                description = getProfileDescription(profile)

                if (profile.picture) {
                    image = profile.picture
                }

                console.log(`Enhanced OG metadata with profile data: ${displayName}`)
            } else {
                console.log(`Profile not found for pubkey: ${profileId}`)
                title = `Profile ${profileId.substring(0, 8)}... | Wavefunc`
            }
        } catch (error) {
            console.error(`Error fetching profile metadata:`, error)
        }
    }

    if (!image.startsWith('http')) {
        image = new URL(image, req.url).href
    }

    return `
    <!-- Primary Meta Tags -->
    <meta name="title" content="${title}">
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${req.url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:logo" content="${new URL('/images/logo.png', req.url).href}" />
    <meta property="og:site_name" content="Wavefunc" />
    
    <!-- Twitter / Telegram -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${title}" />
    
    <!-- Additional Telegram-friendly tags -->
    <meta name="telegram:title" content="${title}" />
    <meta name="telegram:description" content="${description}" />
    <meta name="telegram:image" content="${image}" />
`
}

/**
 * Inject OpenGraph meta tags into the HTML for bot requests
 */
export async function injectOpenGraphMetadata(html: string, req: Request): Promise<string> {
    const openGraphTags = await generateOpenGraphTags(req)

    return html.replace('</head>', `${openGraphTags}</head>`)
}
