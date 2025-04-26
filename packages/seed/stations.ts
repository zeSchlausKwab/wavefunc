import type { NostrEvent } from '@nostr-dev-kit/ndk'
import { RADIO_EVENT_KINDS, NIP89_EVENT_KINDS, APP_PUBKEY } from '../../packages/common/src/nostr/radio'

// Fixed handler ID for seeding purposes
const HANDLER_ID = 'seedhandler123'

// Create a client tag for the seed stations
const seedClientTag = [
    'client',
    'NostrRadio',
    `${NIP89_EVENT_KINDS.HANDLER}:${APP_PUBKEY}:${HANDLER_ID}`,
    // No relay hint for seeding
]

// Keys for different radio organizations
export const seedStationKeys = {
    fip: {
        npub: 'npub14zl3zsashjg6dz5ulvh9cj2z0hmyyl5e7v7hsylxwskh2m6y27wsw8sc3z',
        nsec: 'nsec1p5hr62krg2zr438ddgh7snrww5unyq4xtk0kvecsvax0fmg6m7xsas8fqz',
    },
    soma: {
        npub: 'npub1v974hsushfgn3d7wswjaxazstfa7wtycdv5cszez9rndxj95y4cqfqkjht',
        nsec: 'nsec1tsl9ytw3rhe4h05rmhqcjan5pz2dwvcxxvt8y4jnzrq3rza0n7qqclccmg',
    },
    iwayhigh: {
        npub: 'npub1ph9t8pgtym3kuasd6vtp5zrmce4yrf2uz48fx0dhrlpwrg3xnscs7g50dt',
        nsec: 'nsec1vyue8fvxr62qhlct9j5rj923t4pszslgmgydrc5t9ru78kc57n5sugm8al',
    },
} as const

// Define fixed d-tag values for our seed stations
const FIP_RADIO_DTAG = 'fip01'
const FIP_ROCK_DTAG = 'fip02'
const DRONE_ZONE_DTAG = 'soma01'
const VAPORWAVES_DTAG = 'soma02'
const CLIQHOP_DTAG = 'soma03'
const IWAYHIGH_DTAG = 'iway01'

// Function to add client tag to all stations
function addClientTagToStations(stations: NostrEvent[]): NostrEvent[] {
    return stations.map((station) => {
        // Create a new station object with all the same properties
        return {
            ...station,
            // Add client tag if not already present
            tags: station.tags.some((tag) => tag[0] === 'client') ? station.tags : [...station.tags, seedClientTag],
        }
    })
}

// Create a handler event for seeding
export const seedHandlerEvent: NostrEvent = {
    kind: NIP89_EVENT_KINDS.HANDLER,
    pubkey: APP_PUBKEY,
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
        ['d', HANDLER_ID],
        ['k', RADIO_EVENT_KINDS.STREAM.toString()],
        ['web', 'https://wavefunc.io/station/<bech32>', 'nevent'],
        ['web', 'https://wavefunc.io/stations', 'naddr'],
    ],
}

// Our raw seed stations
const rawSeedStations: NostrEvent[] = [
    // FIP Radio Stations
    {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
        content: JSON.stringify({
            name: 'FIP Radio',
            description:
                'Curious and sophisticated: Since 1971 FIP offers a versatile program of jazz, chansons, world music and electronic tunes.',
            website: 'https://www.radio.net/s/fip',
            streams: [
                {
                    url: 'https://icecast.radiofrance.fr/fiprock-hifi.aac',
                    format: 'audio/aac',
                    quality: {
                        bitrate: 128000,
                        codec: 'aac',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
                {
                    url: 'https://stream.fip.example.com/high',
                    format: 'audio/aac',
                    quality: {
                        bitrate: 256000,
                        codec: 'aac',
                        sampleRate: 48000,
                    },
                },
            ],
        }),
        tags: [
            ['d', FIP_RADIO_DTAG],
            ['name', 'FIP Radio'],
            [
                'description',
                'Curious and sophisticated: Since 1971 FIP offers a versatile program of jazz, chansons, world music and electronic tunes.',
            ],
            ['t', 'jazz'],
            ['t', 'world'],
            ['t', 'electronic'],
            ['l', 'fr'],
            ['location', 'Paris, FR'],
            ['thumbnail', 'https://picsum.photos/seed/fip/400/400'],
        ],
    },
    {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '', // Will be set to FIP's pubkey
        content: JSON.stringify({
            name: 'FIP Rock',
            description: "FIP's dedicated rock music channel featuring pop and rock music.",
            website: 'https://www.radio.net/s/fipautourdurock',
            streams: [
                {
                    url: 'https://icecast.radiofrance.fr/fip-hifi.aac',
                    format: 'audio/aac',
                    quality: {
                        bitrate: 128000,
                        codec: 'aac',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
            ],
        }),
        tags: [
            ['d', FIP_ROCK_DTAG],
            ['name', 'FIP Rock'],
            ['description', "FIP's dedicated rock music channel featuring pop and rock music."],
            ['t', 'rock'],
            ['t', 'pop'],
            ['l', 'fr'],
            ['location', 'Paris, FR'],
            ['thumbnail', 'https://picsum.photos/seed/fiprock/400/400'],
        ],
    },

    // SomaFM Stations
    {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
        content: JSON.stringify({
            name: 'Drone Zone',
            description: 'Served best chilled, safe with most medications. Atmospheric textures with minimal beats.',
            website: 'https://somafm.com/dronezone/',
            streams: [
                {
                    url: 'https://ice.somafm.com/dronezone-128-aac',
                    format: 'audio/aac',
                    quality: {
                        bitrate: 128000,
                        codec: 'aac',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
                {
                    url: 'https://ice.somafm.com/dronezone-256-mp3',
                    format: 'audio/mpeg',
                    quality: {
                        bitrate: 256000,
                        codec: 'mp3',
                        sampleRate: 48000,
                    },
                },
            ],
        }),
        tags: [
            ['d', DRONE_ZONE_DTAG],
            ['name', 'Drone Zone'],
            [
                'description',
                'Served best chilled, safe with most medications. Atmospheric textures with minimal beats.',
            ],
            ['t', 'ambient'],
            ['t', 'electronic'],
            ['t', 'space'],
            ['l', 'en'],
            ['location', 'San Francisco, US'],
            ['thumbnail', 'https://picsum.photos/seed/dronezone/400/400'],
        ],
    },
    {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '', // Will be set to SomaFM's pubkey
        content: JSON.stringify({
            name: 'Vaporwaves',
            description: 'All Vaporwave. All the time. The aesthetic of a time gone by with a modern interpretation.',
            website: 'https://somafm.com/vaporwaves/',
            streams: [
                {
                    url: 'https://ice.somafm.com/vaporwaves-128-aac',
                    format: 'audio/aac',
                    quality: {
                        bitrate: 128000,
                        codec: 'aac',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
            ],
        }),
        tags: [
            ['d', VAPORWAVES_DTAG],
            ['name', 'Vaporwaves'],
            [
                'description',
                'All Vaporwave. All the time. The aesthetic of a time gone by with a modern interpretation.',
            ],
            ['t', 'vaporwave'],
            ['t', 'electronic'],
            ['l', 'en'],
            ['location', 'San Francisco, US'],
            ['thumbnail', 'https://picsum.photos/seed/vaporwaves/400/400'],
        ],
    },
    {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
        content: JSON.stringify({
            name: 'Cliqhop IDM',
            description: "Blips'n'beeps backed mostly w/beats. Intelligent Dance Music.",
            website: 'https://somafm.com/cliqhop/',
            streams: [
                {
                    url: 'https://ice.somafm.com/cliqhop-128-aac',
                    format: 'audio/aac',
                    quality: {
                        bitrate: 128000,
                        codec: 'aac',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
                {
                    url: 'https://ice.somafm.com/cliqhop-256-mp3',
                    format: 'audio/mpeg',
                    quality: {
                        bitrate: 256000,
                        codec: 'mp3',
                        sampleRate: 48000,
                    },
                },
            ],
        }),
        tags: [
            ['d', CLIQHOP_DTAG],
            ['name', 'Cliqhop IDM'],
            ['description', "Blips'n'beeps backed mostly w/beats. Intelligent Dance Music."],
            ['t', 'idm'],
            ['t', 'electronic'],
            ['t', 'experimental'],
            ['l', 'en'],
            ['location', 'San Francisco, US'],
            ['thumbnail', 'https://picsum.photos/seed/cliqhop/400/400'],
        ],
    },

    // iWayHigh Station
    {
        kind: RADIO_EVENT_KINDS.STREAM,
        created_at: Math.floor(Date.now() / 1000),
        pubkey: '',
        content: JSON.stringify({
            name: 'iWayHigh',
            description: 'Dub electro chill radio',
            website: 'http://iwayhigh.net/radio.php',
            streams: [
                {
                    url: 'http://172.105.24.4:8000/;',
                    format: 'audio/mpeg',
                    quality: {
                        bitrate: 128000,
                        codec: 'mp3',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
            ],
        }),
        tags: [
            ['d', IWAYHIGH_DTAG],
            ['name', 'iWayHigh'],
            ['description', 'Dub electro chill radio'],
            ['t', 'dub'],
            ['t', 'electronic'],
            ['t', 'chill'],
            ['l', 'en'],
            ['location', 'Unknown'],
            ['thumbnail', 'https://picsum.photos/seed/iwayhigh/400/400'],
        ],
    },
]

// Our final seed stations
export const seedStations: NostrEvent[] = addClientTagToStations(rawSeedStations)
