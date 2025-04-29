import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import mysql from 'mysql2/promise'
import * as dotenv from 'dotenv'
import { publishStation } from '../packages/common/src/nostr/publish'
import { RADIO_EVENT_KINDS } from '../packages/common/src/schemas/events'

// Load .env
dotenv.config({ path: '../.env' })
const PRIVATE_KEY = process.env.APP_PRIVATE_KEY

if (!PRIVATE_KEY) {
    throw Error('Missing APP_PRIVATE_KEY in .env!')
}

// MariaDB connection
const conn = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'my-secret-pw',
    database: 'radio',
})

// Setup NDK with a signer
const signer = new NDKPrivateKeySigner(PRIVATE_KEY)
const relayUrls = ['ws://192.168.0.188:3002']

const ndk = new NDK({
    explicitRelayUrls: relayUrls,
    signer,
})

// Helper to fetch station data
async function fetchStations() {
    const [rows] = await conn.query(`
        SELECT 
            StationUuid, 
            Name, 
            Url, 
            Homepage,
            Favicon, 
            Tags, 
            CountryCode,
            Country,
            Language,
            LanguageCodes,
            Codec,
            Bitrate,
            Hls,
            LastCheckOK,
            LastCheckTime,
            ClickCount,
            ClickTrend,
            ClickTimestamp,
            SslError,
            GeoLat,
            GeoLong,
            ExtendedInfo
        FROM Station 
        WHERE LastCheckOK = 1
        LIMIT 10;
    `)
    return rows as any[]
}

// Convert DB station to Nostr event format
async function publishRadioStation(station: any) {
    // Pretty log the station details
    console.log('\n=== Publishing station ===')
    console.log(
        JSON.stringify(
            {
                stationuuid: station.StationUuid,
                name: station.Name,
                url: station.Url,
                homepage: station.Homepage,
                favicon: station.Favicon,
                tags: station.Tags,
                country: station.Country,
                countrycode: station.CountryCode,
                language: station.Language,
                languagecodes: station.LanguageCodes,
                codec: station.Codec,
                bitrate: station.Bitrate,
                lastcheckok: station.LastCheckOK,
                lastchecktime: station.LastCheckTime,
            },
            null,
            2,
        ),
    )

    // Extract tags to include in the description
    const tags = station.Tags
        ? station.Tags.split(',')
              .map((tag: string) => tag.trim())
              .filter(Boolean)
        : []

    // Create streams array with the main URL and required details per StreamSchema
    const streams = [
        {
            url: station.Url,
            format: station.Codec ? `audio/${station.Codec.toLowerCase()}` : 'audio/mpeg',
            quality: {
                bitrate: (station.Bitrate || 128) * 1000, // Convert to bits per second as required in SPEC
                codec: station.Codec || 'mp3',
                sampleRate: 44100, // Standard sample rate
            },
            primary: true,
        },
    ]

    // Create content object with tags in description - must match RadioEventContentSchema
    const content = {
        description: tags.length > 0 ? tags.join(', ').toLowerCase() : `${station.Name} radio station`,
        streams: streams,
    }

    // Create event with required tags
    const event = {
        kind: RADIO_EVENT_KINDS.STREAM,
        content: JSON.stringify(content),
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['d', station.StationUuid],
            ['name', station.Name],
        ],
        pubkey: '',
    }

    if (station.Homepage && station.Homepage.trim()) {
        let website = station.Homepage.trim()
        if (!website.startsWith('http://') && !website.startsWith('https://')) {
            website = 'https://' + website
        }
        event.tags.push(['website', website])
    }

    if (station.Favicon && station.Favicon.trim()) {
        let favicon = station.Favicon.trim()
        if (!favicon.startsWith('http://') && !favicon.startsWith('https://')) {
            favicon = 'https://' + favicon
        }
        event.tags.push(['thumbnail', favicon])
    }

    if (station.CountryCode && station.CountryCode.trim()) {
        event.tags.push(['countryCode', station.CountryCode.trim()])
    }

    if (station.Country && station.Country.trim()) {
        event.tags.push(['location', station.Country.trim()])
    }

    if (station.LanguageCodes && station.LanguageCodes.trim()) {
        const languageCodes = station.LanguageCodes.split(',')
        languageCodes.forEach((code: string) => {
            if (code.trim()) {
                event.tags.push(['l', code.trim().toUpperCase()])
            }
        })
    } else if (station.Language && station.Language.trim()) {
        event.tags.push(['l', station.Language.trim().toUpperCase()])
    }

    if (station.Tags) {
        station.Tags.split(',').forEach((tag: string) => {
            if (tag.trim()) {
                event.tags.push(['t', tag.trim().toLowerCase()])
            }
        })
    }

    console.log('\nPrepared Nostr event:')
    console.log(
        JSON.stringify(
            {
                kind: RADIO_EVENT_KINDS.STREAM,
                content: JSON.parse(event.content),
                tags: event.tags,
            },
            null,
            2,
        ),
    )

    const result = await publishStation(ndk as any, event, ['client', 'radio-db-migrate'])
    console.log(`✓ Published station: ${station.Name} (${result.id})\n`)
    return result
}

async function main() {
    try {
        await ndk.connect()
        const stations = await fetchStations()

        for (const station of stations) {
            await publishRadioStation(station)
        }

        console.log('✅ All stations published!')
    } finally {
        await conn.end()
    }
}

main().catch(console.error)
