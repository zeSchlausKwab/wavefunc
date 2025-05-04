import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import mysql from 'mysql2/promise'
import * as dotenv from 'dotenv'
import { publishStation } from '../packages/common/src/nostr/publish'
import { RADIO_EVENT_KINDS } from '../packages/common/src/schemas/events'
import stringSimilarity from 'string-similarity'

// Load .env
dotenv.config({ path: '../.env' })
const PRIVATE_KEY = process.env.APP_PRIVATE_KEY
const APP_PUBKEY = process.env.APP_PUBKEY
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
// const relayUrls = ['wss://relay.wavefunc.live']
const relayUrls = ['ws://192.168.0.185:3002']

const ndk = new NDK({
    explicitRelayUrls: relayUrls,
    signer,
})

// Define interfaces for our station and stream types
interface DBStation {
    StationUuid: string
    Name: string
    Url: string
    Homepage?: string
    Favicon?: string
    Tags?: string
    CountryCode?: string
    Country?: string
    Language?: string
    LanguageCodes?: string
    Codec?: string
    Bitrate?: number
    LastCheckOK: number
    LastCheckTime?: string
    ServerUuid?: string
    [key: string]: any // For other properties we might not explicitly define
}

interface StreamQuality {
    bitrate: number
    codec: string
    sampleRate: number
}

interface Stream {
    url: string
    format: string
    quality: StreamQuality
    primary: boolean
}

interface StationGroup {
    mainStation: DBStation
    streams: Stream[]
    similarStations: DBStation[]
    mergedMetadata: {
        Homepage?: string
        Favicon?: string
        Tags: Set<string>
        CountryCode?: string
        Country?: string
        Language?: string
        LanguageCodes: Set<string>
    }
}

// Helper to fetch station data
async function fetchStations(): Promise<DBStation[]> {
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
            ServerUuid,
            ExtendedInfo
        FROM Station 
        WHERE LastCheckOK = 1
    `)
    return rows as DBStation[]
}

// Helper to fetch streaming server URL by UUID
async function fetchStreamingServerUrl(serverUuid: string): Promise<string | null> {
    if (!serverUuid) return null

    try {
        const [rows] = await conn.query(
            `
            SELECT Url
            FROM StreamingServers
            WHERE Uuid = ?
        `,
            [serverUuid],
        )

        if (Array.isArray(rows) && rows.length > 0) {
            return (rows[0] as any).Url || null
        }
        return null
    } catch (error) {
        console.error(`Error fetching streaming server URL for UUID ${serverUuid}:`, error)
        return null
    }
}

// Group similar stations
function groupSimilarStations(stations: DBStation[]): StationGroup[] {
    const groups: StationGroup[] = []
    const processedStationIds = new Set<string>()

    // Increase similarity threshold to require higher match (0.9 = 90% similar)
    const SIMILARITY_THRESHOLD = 0.9

    // For statistics
    const groupingStats = {
        totalGroups: 0,
        totalDuplicatesFound: 0,
        largestGroupSize: 0,
        largestGroupName: '',
        groupSizes: {} as Record<number, number>, // Size -> count
    }

    // Group by exact name match first (case insensitive)
    const nameGroups: Record<string, DBStation[]> = {}

    // First pass: group by exact name match
    stations.forEach((station) => {
        const nameLower = station.Name.toLowerCase().trim()
        if (!nameGroups[nameLower]) {
            nameGroups[nameLower] = []
        }
        nameGroups[nameLower].push(station)
    })

    // Process exact name matches first
    Object.entries(nameGroups).forEach(([name, stationsWithSameName]) => {
        if (stationsWithSameName.length > 1) {
            // Found stations with exactly the same name
            const mainStation = stationsWithSameName[0]

            if (processedStationIds.has(mainStation.StationUuid)) return

            // Initialize the merged metadata
            const mergedMetadata = {
                Homepage: mainStation.Homepage,
                Favicon: mainStation.Favicon,
                Tags: new Set<string>(
                    mainStation.Tags
                        ? mainStation.Tags.split(',')
                              .map((t) => t.trim())
                              .filter(Boolean)
                        : [],
                ),
                CountryCode: mainStation.CountryCode,
                Country: mainStation.Country,
                Language: mainStation.Language,
                LanguageCodes: new Set<string>(
                    mainStation.LanguageCodes
                        ? mainStation.LanguageCodes.split(',')
                              .map((c) => c.trim())
                              .filter(Boolean)
                        : [],
                ),
            }

            const group: StationGroup = {
                mainStation,
                streams: [
                    {
                        url: mainStation.Url,
                        format: mainStation.Codec ? `audio/${mainStation.Codec.toLowerCase()}` : 'audio/mpeg',
                        quality: {
                            bitrate: (mainStation.Bitrate || 128) * 1000,
                            codec: mainStation.Codec || 'mp3',
                            sampleRate: 44100,
                        },
                        primary: true,
                    },
                ],
                similarStations: [],
                mergedMetadata,
            }

            processedStationIds.add(mainStation.StationUuid)
            let duplicatesInGroup = 0

            // Add all other stations with the same name
            for (let i = 1; i < stationsWithSameName.length; i++) {
                const similar = stationsWithSameName[i]

                // Ensure URLs are different
                if (similar.Url !== mainStation.Url) {
                    // Only group streams that are likely to be the same station with different quality
                    // This heuristic looks for common URL patterns to avoid grouping different stations
                    const isSameStation = areRelatedStreams(mainStation, similar)

                    if (isSameStation) {
                        group.similarStations.push(similar)
                        duplicatesInGroup++

                        group.streams.push({
                            url: similar.Url,
                            format: similar.Codec ? `audio/${similar.Codec.toLowerCase()}` : 'audio/mpeg',
                            quality: {
                                bitrate: (similar.Bitrate || 128) * 1000,
                                codec: similar.Codec || 'mp3',
                                sampleRate: 44100,
                            },
                            primary: false,
                        })

                        processedStationIds.add(similar.StationUuid)

                        // Merge metadata from similar station
                        mergeStationMetadata(group.mergedMetadata, similar)
                    }
                }
            }

            // Only add groups that have multiple streams
            if (group.streams.length > 1) {
                // Update statistics
                groupingStats.totalGroups++
                groupingStats.totalDuplicatesFound += duplicatesInGroup

                const groupSize = duplicatesInGroup + 1
                groupingStats.groupSizes[groupSize] = (groupingStats.groupSizes[groupSize] || 0) + 1

                if (groupSize > groupingStats.largestGroupSize) {
                    groupingStats.largestGroupSize = groupSize
                    groupingStats.largestGroupName = mainStation.Name
                }

                groups.push(group)
            }
        }
    })

    // Second pass: for stations not yet grouped, create individual groups
    for (let i = 0; i < stations.length; i++) {
        const station = stations[i]

        // Skip if we've already processed this station
        if (processedStationIds.has(station.StationUuid)) continue

        // Initialize the merged metadata for this single station
        const mergedMetadata = {
            Homepage: station.Homepage,
            Favicon: station.Favicon,
            Tags: new Set<string>(
                station.Tags
                    ? station.Tags.split(',')
                          .map((t) => t.trim())
                          .filter(Boolean)
                    : [],
            ),
            CountryCode: station.CountryCode,
            Country: station.Country,
            Language: station.Language,
            LanguageCodes: new Set<string>(
                station.LanguageCodes
                    ? station.LanguageCodes.split(',')
                          .map((c) => c.trim())
                          .filter(Boolean)
                    : [],
            ),
        }

        // Create a new single-station group
        const group: StationGroup = {
            mainStation: station,
            streams: [
                {
                    url: station.Url,
                    format: station.Codec ? `audio/${station.Codec.toLowerCase()}` : 'audio/mpeg',
                    quality: {
                        bitrate: (station.Bitrate || 128) * 1000,
                        codec: station.Codec || 'mp3',
                        sampleRate: 44100,
                    },
                    primary: true,
                },
            ],
            similarStations: [],
            mergedMetadata,
        }

        processedStationIds.add(station.StationUuid)

        // We're no longer doing fuzzy similarity matching
        // Each station not exactly matched gets its own entry

        // Update statistics for single stations
        groupingStats.totalGroups++

        const groupSize = 1
        groupingStats.groupSizes[groupSize] = (groupingStats.groupSizes[groupSize] || 0) + 1

        groups.push(group)
    }

    // Add grouping stats to the returned object
    ;(groups as any).stats = groupingStats

    return groups
}

// Helper to merge metadata from similar stations
function mergeStationMetadata(mergedMetadata: StationGroup['mergedMetadata'], station: DBStation): void {
    // For Homepage and Favicon, take the first non-empty value
    if (!mergedMetadata.Homepage && station.Homepage) {
        mergedMetadata.Homepage = station.Homepage
    }

    if (!mergedMetadata.Favicon && station.Favicon) {
        mergedMetadata.Favicon = station.Favicon
    }

    // For tags, add any new tags
    if (station.Tags) {
        station.Tags.split(',').forEach((tag) => {
            const trimmedTag = tag.trim()
            if (trimmedTag) {
                mergedMetadata.Tags.add(trimmedTag)
            }
        })
    }

    // Country and CountryCode should be consistent across stations
    // Only update if missing and available in the current station
    if (!mergedMetadata.CountryCode && station.CountryCode) {
        mergedMetadata.CountryCode = station.CountryCode
    }

    if (!mergedMetadata.Country && station.Country) {
        mergedMetadata.Country = station.Country
    }

    // Same for language
    if (!mergedMetadata.Language && station.Language) {
        mergedMetadata.Language = station.Language
    }

    // For language codes, merge all codes
    if (station.LanguageCodes) {
        station.LanguageCodes.split(',').forEach((code) => {
            const trimmedCode = code.trim()
            if (trimmedCode) {
                mergedMetadata.LanguageCodes.add(trimmedCode)
            }
        })
    }
}

// Helper to determine if two stations are related streams of the same station
function areRelatedStreams(station1: DBStation, station2: DBStation): boolean {
    // Don't consider "Radio Caprice" stations the same - they're different
    if (station1.Name.includes('Radio Caprice') || station2.Name.includes('Radio Caprice')) {
        return false
    }

    // Don't consider "ANTENNEBAYERN" stations the same - they're different channels
    if (station1.Name.includes('ANTENNEBAYERN') || station2.Name.includes('ANTENNEBAYERN')) {
        return false
    }

    // Extract domain names from URLs to compare
    const domain1 = extractDomain(station1.Url)
    const domain2 = extractDomain(station2.Url)

    // If domains are the same, they might be different quality streams of the same station
    if (domain1 && domain2 && domain1 === domain2) {
        // Same domain, likely different quality streams of the same station
        // Look for URL patterns that suggest different bitrates/formats
        const url1 = station1.Url.toLowerCase()
        const url2 = station2.Url.toLowerCase()

        // Check if URLs differ in quality indicators: mp3/aac, bitrate numbers, etc.
        const qualityKeywords = [
            'mp3',
            'aac',
            'ogg',
            'flac',
            'opus',
            '64',
            '96',
            '128',
            '192',
            '256',
            '320',
            'low',
            'medium',
            'high',
            'hd',
            'mobile',
            'web',
            'quality',
            'hq',
            'lq',
            'hi',
            'lo',
            'best',
        ]

        // Count quality-related differences between URLs
        let qualityDifferences = 0
        for (const keyword of qualityKeywords) {
            if (url1.includes(keyword) !== url2.includes(keyword)) {
                qualityDifferences++
            }
        }

        return qualityDifferences > 0
    }

    return false
}

// Helper to extract domain from URL
function extractDomain(url: string): string | null {
    try {
        // Handle URLs without protocol
        if (!url.includes('://')) {
            url = 'http://' + url
        }

        const urlObj = new URL(url)
        return urlObj.hostname
    } catch (e) {
        return null
    }
}

// Helper function to print station group details
function printGroupDetails(group: StationGroup): void {
    console.log(`\n=======================================`)
    console.log(`Group: ${group.mainStation.Name} (${group.streams.length} streams)`)
    console.log(`Main station: ${group.mainStation.Name} - ${group.mainStation.Url}`)

    if (group.similarStations.length > 0) {
        console.log(`Similar stations:`)
        group.similarStations.forEach((similar, idx) => {
            console.log(`  ${idx + 1}. ${similar.Name} - ${similar.Url}`)
        })
    }

    console.log(`Streams:`)
    group.streams.forEach((stream, idx) => {
        console.log(`  ${idx + 1}. ${stream.url} (${stream.quality.bitrate / 1000}kbps ${stream.quality.codec})`)
    })

    // Print merged metadata
    console.log(`Merged metadata:`)
    console.log(`  Homepage: ${group.mergedMetadata.Homepage || 'N/A'}`)
    console.log(`  Favicon: ${group.mergedMetadata.Favicon || 'N/A'}`)
    console.log(`  Tags: ${Array.from(group.mergedMetadata.Tags).join(', ') || 'N/A'}`)
    console.log(`  Country: ${group.mergedMetadata.Country || 'N/A'} (${group.mergedMetadata.CountryCode || 'N/A'})`)
    console.log(`  Language: ${group.mergedMetadata.Language || 'N/A'}`)
    console.log(`  Language Codes: ${Array.from(group.mergedMetadata.LanguageCodes).join(', ') || 'N/A'}`)
}

// Convert DB station to Nostr event format
async function publishRadioStation(stationGroup: StationGroup) {
    const station = stationGroup.mainStation
    const mergedMetadata = stationGroup.mergedMetadata

    // Get all tags from the merged metadata
    const tags = Array.from(mergedMetadata.Tags)

    // Fetch streaming server URL if ServerUuid is available
    let streamingServerUrl = null
    if (station.ServerUuid) {
        streamingServerUrl = await fetchStreamingServerUrl(station.ServerUuid)
    }

    // Create content object with tags in description - must match RadioEventContentSchema
    const content: {
        description: string
        streams: Stream[]
        streamingServerUrl?: string
    } = {
        description: tags.length > 0 ? tags.join(', ').toLowerCase() : `${station.Name} radio station`,
        streams: stationGroup.streams,
    }

    // Add streamingServerUrl to content if available
    if (streamingServerUrl) {
        content.streamingServerUrl = streamingServerUrl
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

    // Use the merged metadata for all other tags
    if (mergedMetadata.Homepage) {
        let website = mergedMetadata.Homepage.trim()
        if (!website.startsWith('http://') && !website.startsWith('https://')) {
            website = 'https://' + website
        }
        event.tags.push(['website', website])
    }

    if (mergedMetadata.Favicon) {
        let favicon = mergedMetadata.Favicon.trim()
        if (!favicon.startsWith('http://') && !favicon.startsWith('https://')) {
            favicon = 'https://' + favicon
        }
        event.tags.push(['thumbnail', favicon])
    }

    if (mergedMetadata.CountryCode) {
        event.tags.push(['countryCode', mergedMetadata.CountryCode.trim()])
    }

    if (mergedMetadata.Country) {
        event.tags.push(['location', mergedMetadata.Country.trim()])
    }

    // Add all language codes from the merged metadata
    if (mergedMetadata.LanguageCodes.size > 0) {
        Array.from(mergedMetadata.LanguageCodes).forEach((code) => {
            event.tags.push(['l', code.toUpperCase()])
        })
    } else if (mergedMetadata.Language) {
        event.tags.push(['l', mergedMetadata.Language.trim().toUpperCase()])
    }

    // Add all tags from the merged metadata
    Array.from(mergedMetadata.Tags).forEach((tag) => {
        event.tags.push(['t', tag.toLowerCase()])
    })

    const result = await publishStation(ndk as any, event, [
        'client',
        'Wavefunc',
        `31990:${APP_PUBKEY}:wavefuncstationshandler`,
        'wss://relay.wavefunc.live',
    ])
    // console.log(`✓ Published station: ${station.Name} with ${stationGroup.streams.length} streams (${result.id})`)
    return result
}

async function main() {
    try {
        await ndk.connect()
        const stations = await fetchStations()
        console.log(`Fetched ${stations.length} stations from the database`)

        // Group similar stations
        const stationGroups = groupSimilarStations(stations)
        const stats = (stationGroups as any).stats

        console.log(
            `Grouped into ${stationGroups.length} unique stations (${stations.length - stationGroups.length} duplicates merged)`,
        )

        // Show detailed grouping statistics
        console.log('\n===== Duplicate Grouping Statistics =====')
        console.log(`Total original stations: ${stations.length}`)
        console.log(`Total unique station groups: ${stats.totalGroups}`)
        console.log(`Total duplicates found: ${stats.totalDuplicatesFound}`)
        console.log(`Average streams per station: ${(stations.length / stats.totalGroups).toFixed(2)}`)
        console.log(`Largest group: ${stats.largestGroupName} with ${stats.largestGroupSize} stations`)

        console.log('\nGroup size distribution:')
        Object.entries(stats.groupSizes)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .forEach(([size, count]) => {
                console.log(
                    `  ${size} stream${Number(size) > 1 ? 's' : ''}: ${count} station${Number(count) > 1 ? 's' : ''}`,
                )
            })

        // Show examples of the largest groups
        console.log('\n===== Sample Groups With Multiple Streams =====')
        const groupsWithMultipleStreams = stationGroups
            .filter((g) => g.streams.length > 1)
            .sort((a, b) => b.streams.length - a.streams.length)

        // Show up to 5 of the largest groups
        const samplesToShow = Math.min(5, groupsWithMultipleStreams.length)
        for (let i = 0; i < samplesToShow; i++) {
            printGroupDetails(groupsWithMultipleStreams[i])
        }

        // Ask for confirmation before continuing with the actual migration
        console.log('\n===== Ready to Migrate =====')
        console.log(`About to migrate ${stationGroups.length} station groups.`)
        console.log('Press Ctrl+C to cancel or any key to continue...')

        // Wait for user confirmation
        process.stdin.setRawMode(true)
        process.stdin.resume()
        process.stdin.once('data', async () => {
            process.stdin.setRawMode(false)
            process.stdin.pause()

            // Proceed with migration
            console.log('\nStarting migration...')

            // Progress tracking variables
            let publishedCount = 0
            let successCount = 0
            let failedCount = 0
            const totalCount = stationGroups.length
            const startTime = Date.now()
            let lastUpdateTime = startTime

            for (const stationGroup of stationGroups) {
                try {
                    const result = await publishRadioStation(stationGroup)
                    publishedCount++

                    if (result && result.id) {
                        successCount++
                    } else {
                        failedCount++
                    }

                    // Update progress every second or every 10 stations
                    const currentTime = Date.now()
                    if (publishedCount % 10 === 0 || currentTime - lastUpdateTime > 1000) {
                        const elapsedSeconds = (currentTime - startTime) / 1000
                        const stationsPerSecond = publishedCount / elapsedSeconds
                        const percentComplete = ((publishedCount / totalCount) * 100).toFixed(1)
                        const estimatedTotalTime = totalCount / stationsPerSecond
                        const estimatedRemaining = estimatedTotalTime - elapsedSeconds

                        process.stdout.write(
                            `\r[${percentComplete}%] Published ${publishedCount}/${totalCount} stations ` +
                                `(${successCount} success, ${failedCount} failed) | ` +
                                `${stationsPerSecond.toFixed(1)} stations/sec | ` +
                                `Remaining: ${formatTime(estimatedRemaining)}`,
                        )

                        lastUpdateTime = currentTime
                    }
                } catch (error) {
                    failedCount++
                    console.error(`\nError publishing station ${stationGroup.mainStation.Name}:`, error)
                }
            }

            const totalTime = (Date.now() - startTime) / 1000
            console.log(`\n\n✅ Migration completed in ${formatTime(totalTime)}`)
            console.log(`Total stations: ${totalCount}`)
            console.log(`Successfully published: ${successCount}`)
            console.log(`Failed: ${failedCount}`)

            // Query the events table to show count
            try {
                const [eventRows] = await conn.query('SELECT COUNT(*) as count FROM event WHERE kind = ?', [
                    RADIO_EVENT_KINDS.STREAM,
                ])
                const { count } = (eventRows as any)[0]
                console.log(`Total events in database: ${count}`)
            } catch (error) {
                console.error('Could not count events in database:', error)
            }

            await conn.end()
        })
    } catch (error) {
        console.error('Error:', error)
        await conn.end()
    }
}

// Helper function to format time in minutes and seconds
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
}

main().catch(console.error)
