import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import mysql from 'mysql2/promise'
import * as dotenv from 'dotenv'
import { publishStation } from '../packages/common/src/nostr/publish'
import { RADIO_EVENT_KINDS } from '../packages/common/src/schemas/events'
import stringSimilarity from 'string-similarity'

// Load .env
dotenv.config({ path: '../.env' })
const PRIVATE_KEY = process.env.APP_PRIVATE_KEY
const VITE_APP_PUBKEY = process.env.VITE_APP_PUBKEY
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
const relayUrls = process.env.DEFAULT_RELAY_URLS?.split(',').filter(Boolean) || ['wss://relay.wavefunc.live']

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

// Extract the base URL pattern from a URL (domain + path structure)
function extractUrlPattern(url: string): string {
    try {
        // Handle URLs without protocol
        if (!url.includes('://')) {
            url = 'http://' + url
        }

        const urlObj = new URL(url)
        const domain = urlObj.hostname
        // Include port in the pattern since different ports often indicate different stations
        const port = urlObj.port ? `:${urlObj.port}` : ''

        // Extract path components and remove empty segments
        const pathParts = urlObj.pathname.split('/').filter(Boolean)

        // Handle common streaming URL patterns where the last part of the path
        // is a unique identifier for the station

        // If path contains at least one segment
        if (pathParts.length >= 1) {
            // Common streaming URL patterns where path contains unique identifiers

            // 1. For URLs with specific streaming path patterns
            if (
                pathParts.length >= 2 &&
                (pathParts[0].toLowerCase() === 'live' ||
                    pathParts[0].toLowerCase() === 'stream' ||
                    pathParts[0].toLowerCase() === 'streams' ||
                    pathParts[0].toLowerCase() === 'radio' ||
                    pathParts[0].toLowerCase() === 'audio')
            ) {
                // Include the domain, port and the first two path segments
                return `${domain}${port}/${pathParts[0]}/${pathParts[1]}`
            }

            // 2. For URLs with file-like endings (handle cases where ID is in the filename)
            const lastSegment = pathParts[pathParts.length - 1]
            if (lastSegment.includes('.')) {
                // Get the base name without extension
                const baseName = lastSegment.split('.')[0]
                // Include the domain, port and all path except the extension
                return `${domain}${port}${pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : ''}/${baseName}`
            }

            // 3. Handle URLs where each different path represents a different station
            // Include the full path except file extensions
            return `${domain}${port}/${pathParts.join('/')}`.replace(
                /\.(mp3|aac|ogg|m4a|flac|wav|pls|m3u|m3u8|xspf)$/i,
                '',
            )
        }

        // Default case: domain + port
        return domain + port
    } catch (e) {
        return url
    }
}

// Check if two stations are likely from the same broadcaster based on URL patterns
function areRelatedUrls(url1: string, url2: string): boolean {
    try {
        // First clean both URLs to handle protocol inconsistencies
        if (!url1.includes('://')) url1 = 'http://' + url1
        if (!url2.includes('://')) url2 = 'http://' + url2

        const url1Obj = new URL(url1)
        const url2Obj = new URL(url2)

        // Different domains means probably different stations
        if (url1Obj.hostname !== url2Obj.hostname) {
            // Check for subdomains of the same root domain
            const rootDomain1 = url1Obj.hostname.split('.').slice(-2).join('.')
            const rootDomain2 = url2Obj.hostname.split('.').slice(-2).join('.')

            // Only consider same root domain if we have EXACTLY matching paths
            if (rootDomain1 === rootDomain2) {
                return url1Obj.pathname === url2Obj.pathname
            }

            return false
        }

        // Different ports typically indicate different stations/services
        if (url1Obj.port !== url2Obj.port && url1Obj.port !== '' && url2Obj.port !== '') {
            // Some special cases to handle
            // 1. Check for specific ports used for quality variations (e.g., 8000 vs 8010 for different bitrates)
            const qualityPortPatterns = [
                // Common port patterns for quality variants
                /^80\d{2}$/, // 8000, 8001, 8010, etc.
                /^443\d{1}$/, // 4430, 4431, etc.
                // Add more patterns if needed
            ]

            const isQualityPortDiff = qualityPortPatterns.some((pattern) => {
                // If both ports match the same quality port pattern, they might be related
                if (pattern.test(url1Obj.port) && pattern.test(url2Obj.port)) {
                    // Also check if paths are identical - this is important
                    return url1Obj.pathname === url2Obj.pathname
                }
                return false
            })

            // If not a quality port difference, treat as different stations
            if (!isQualityPortDiff) {
                return false
            }
        }

        // Extract path parts for more detailed comparison
        const path1 = url1Obj.pathname
        const path2 = url2Obj.pathname

        // If paths are identical (ignoring query params), they're the same station
        if (path1 === path2) return true

        // Clean paths (remove extensions)
        const cleanPath1 = path1.replace(/\.(mp3|aac|ogg|m4a|flac|wav|pls|m3u|m3u8|xspf)$/i, '')
        const cleanPath2 = path2.replace(/\.(mp3|aac|ogg|m4a|flac|wav|pls|m3u|m3u8|xspf)$/i, '')

        // If clean paths are identical, they might be the same station with different formats
        if (cleanPath1 === cleanPath2) return true

        // Extract path segments and analyze them
        const segments1 = cleanPath1.split('/').filter(Boolean)
        const segments2 = cleanPath2.split('/').filter(Boolean)

        // Different segment count likely means different resources
        if (segments1.length !== segments2.length) return false

        // Quality and format indicators often found in URLs
        const qualityPatterns = [
            /\b(low|high|medium)\b/i,
            /\b(hq|lq|hi|lo)\b/i,
            /\b(\d{2,3}k)\b/i, // 64k, 128k, 320k etc.
            /\b(\d+)(kbps|k)\b/i, // 64kbps, 128kbps, etc.
            /\b(mobile|desktop|web)\b/i,
            /_(low|high|medium)\b/i,
            /_(64|128|192|320)/i, // Patterns like _64, _128
        ]

        // Count differences in path segments
        let differingSegments = 0
        let qualityDifferences = 0
        let differentIdentifiers = false

        for (let i = 0; i < segments1.length; i++) {
            if (segments1[i] !== segments2[i]) {
                differingSegments++

                // Check if this segment looks like a unique identifier
                const isLikelyId =
                    // Longer alphanumeric strings likely represent unique IDs
                    (segments1[i].length > 8 && /^[a-z0-9]+$/i.test(segments1[i])) ||
                    (segments2[i].length > 8 && /^[a-z0-9]+$/i.test(segments2[i])) ||
                    // If segments differ in the first position after a known streaming path
                    (i === 1 &&
                        (segments1[0].toLowerCase() === 'radio' ||
                            segments1[0].toLowerCase() === 'stream' ||
                            segments1[0].toLowerCase() === 'audio'))

                if (isLikelyId) {
                    differentIdentifiers = true
                    break
                }

                // Check if difference looks like a quality indicator
                const isQualityDiff = qualityPatterns.some(
                    (pattern) => pattern.test(segments1[i]) || pattern.test(segments2[i]),
                )

                if (isQualityDiff) qualityDifferences++
            }
        }

        // If we found different identifiers, they're different stations
        if (differentIdentifiers) return false

        // If the only differences are quality indicators, consider them related
        return differingSegments > 0 && differingSegments === qualityDifferences
    } catch (e) {
        return false
    }
}

// Enhanced case-insensitive name comparison
function normalizeStationName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, '') // Remove all spaces
        .replace(/[^a-z0-9]/gi, '') // Remove non-alphanumeric chars
}

// Enhanced grouping for stations with the same name but possibly different cases/spacing
function groupStationsByNormalizedName(stations: DBStation[]): Record<string, DBStation[]> {
    const groups: Record<string, DBStation[]> = {}

    stations.forEach((station) => {
        const normalizedName = normalizeStationName(station.Name)
        if (!groups[normalizedName]) {
            groups[normalizedName] = []
        }
        groups[normalizedName].push(station)
    })

    return groups
}

// Group stations based on both name and URL patterns
function groupSimilarStations(stations: DBStation[]): StationGroup[] {
    const groups: StationGroup[] = []
    const processedStationIds = new Set<string>()

    // For statistics
    const groupingStats = {
        totalGroups: 0,
        totalDuplicatesFound: 0,
        largestGroupSize: 0,
        largestGroupName: '',
        groupSizes: {} as Record<number, number>, // Size -> count
    }

    // First, organize stations by normalized name
    const nameGroups = groupStationsByNormalizedName(stations)

    // Process each name group
    for (const [normalizedName, stationsWithSameName] of Object.entries(nameGroups)) {
        // Skip if only one station or all already processed
        if (
            stationsWithSameName.length <= 1 ||
            stationsWithSameName.every((station) => processedStationIds.has(station.StationUuid))
        ) {
            continue
        }

        // Get unprocessed stations
        const unprocessedStations = stationsWithSameName.filter(
            (station) => !processedStationIds.has(station.StationUuid),
        )

        if (unprocessedStations.length <= 1) continue

        // For each unprocessed station, try to form a group based on URL pattern
        for (let i = 0; i < unprocessedStations.length; i++) {
            const station = unprocessedStations[i]

            // Skip if already processed in a previous iteration
            if (processedStationIds.has(station.StationUuid)) continue

            // This will be the main station of the new group
            const mainStation = station
            processedStationIds.add(mainStation.StationUuid)

            // Track unique stream URLs
            const uniqueStreamUrls = new Set<string>()
            uniqueStreamUrls.add(mainStation.Url)

            // Initialize the merged metadata
            const mergedMetadata = {
                Homepage: mainStation.Homepage || '',
                Favicon: mainStation.Favicon || '',
                Tags: new Set<string>(
                    mainStation.Tags
                        ? mainStation.Tags.split(',')
                              .map((t) => t.trim())
                              .filter(Boolean)
                        : [],
                ),
                CountryCode: mainStation.CountryCode || '',
                Country: mainStation.Country || '',
                Language: mainStation.Language || '',
                LanguageCodes: new Set<string>(
                    mainStation.LanguageCodes
                        ? mainStation.LanguageCodes.split(',')
                              .map((c) => c.trim())
                              .filter(Boolean)
                        : [],
                ),
            }

            // Create the initial streams list with the main station
            const streams: Stream[] = [
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
            ]

            const similarStations: DBStation[] = []
            let duplicatesInGroup = 0

            // Find other streams with the same name that have similar URL patterns
            for (let j = 0; j < unprocessedStations.length; j++) {
                // Skip the main station itself
                if (i === j) continue

                const candidateStation = unprocessedStations[j]

                // Skip if already processed
                if (processedStationIds.has(candidateStation.StationUuid)) continue

                // Skip if URL is already included
                if (uniqueStreamUrls.has(candidateStation.Url)) continue

                // Check if URLs are related (same broadcaster)
                const urlsAreRelated = areRelatedUrls(mainStation.Url, candidateStation.Url)

                // Only group if URLs look related
                if (urlsAreRelated) {
                    // Additional checks: if both have country codes, they should match
                    if (
                        mainStation.CountryCode &&
                        candidateStation.CountryCode &&
                        mainStation.CountryCode !== candidateStation.CountryCode
                    ) {
                        // Different countries usually mean different stations, even with similar names
                        continue
                    }

                    // Add this station to the group
                    similarStations.push(candidateStation)
                    duplicatesInGroup++
                    processedStationIds.add(candidateStation.StationUuid)
                    uniqueStreamUrls.add(candidateStation.Url)

                    // Add stream
                    streams.push({
                        url: candidateStation.Url,
                        format: candidateStation.Codec ? `audio/${candidateStation.Codec.toLowerCase()}` : 'audio/mpeg',
                        quality: {
                            bitrate: (candidateStation.Bitrate || 128) * 1000,
                            codec: candidateStation.Codec || 'mp3',
                            sampleRate: 44100,
                        },
                        primary: false,
                    })

                    // Merge metadata
                    mergeStationMetadata(mergedMetadata, candidateStation)
                }
            }

            // Create and add the group
            const group: StationGroup = {
                mainStation,
                streams,
                similarStations,
                mergedMetadata,
            }

            // Only add the group if it contains multiple streams or if it's a single important station
            if (streams.length > 1 || mainStation.LastCheckOK === 1) {
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
    }

    // Create individual groups for remaining unprocessed stations
    for (let i = 0; i < stations.length; i++) {
        const station = stations[i]

        // Skip if already processed
        if (processedStationIds.has(station.StationUuid)) continue

        // Initialize metadata for this single station
        const mergedMetadata = {
            Homepage: station.Homepage || '',
            Favicon: station.Favicon || '',
            Tags: new Set<string>(
                station.Tags
                    ? station.Tags.split(',')
                          .map((t) => t.trim())
                          .filter(Boolean)
                    : [],
            ),
            CountryCode: station.CountryCode || '',
            Country: station.Country || '',
            Language: station.Language || '',
            LanguageCodes: new Set<string>(
                station.LanguageCodes
                    ? station.LanguageCodes.split(',')
                          .map((c) => c.trim())
                          .filter(Boolean)
                    : [],
            ),
        }

        // Create a single-station group
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

        // Add to statistics
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
    // For Homepage, prefer non-empty values
    if (!mergedMetadata.Homepage && station.Homepage) {
        mergedMetadata.Homepage = station.Homepage
    }

    // For Favicon, prefer non-empty values
    if (!mergedMetadata.Favicon && station.Favicon) {
        mergedMetadata.Favicon = station.Favicon
    }

    // Special case: if the favicon URL contains the station name, it's likely more relevant
    if (station.Favicon && station.Name) {
        const stationNameNormalized = normalizeStationName(station.Name)
        const faviconLower = station.Favicon.toLowerCase()
        if (faviconLower.includes(stationNameNormalized.substring(0, 5))) {
            mergedMetadata.Favicon = station.Favicon
        }
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

    // Sort streams by bitrate (highest first) to ensure better quality streams are preferred
    const sortedStreams = [...stationGroup.streams].sort((a, b) => {
        return (b.quality.bitrate || 0) - (a.quality.bitrate || 0)
    })

    // Set the highest quality stream as primary
    sortedStreams.forEach((stream, idx) => {
        stream.primary = idx === 0
    })

    // Create content object with tags in description - must match RadioEventContentSchema
    const content: {
        description: string
        streams: Stream[]
        streamingServerUrl?: string
    } = {
        description: tags.length > 0 ? tags.join(', ').toLowerCase() : `${station.Name} radio station`,
        streams: sortedStreams,
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

    // Add all language codes from the merged metadata using 'language' tag
    if (mergedMetadata.LanguageCodes.size > 0) {
        Array.from(mergedMetadata.LanguageCodes).forEach((code) => {
            event.tags.push(['language', code.toUpperCase()]) // Using 'language' tag per SPEC.md
        })
    } else if (mergedMetadata.Language) {
        event.tags.push(['language', mergedMetadata.Language.trim().toUpperCase()]) // Using 'language' tag per SPEC.md
    }

    // Add all tags from the merged metadata
    Array.from(mergedMetadata.Tags).forEach((tag) => {
        event.tags.push(['t', tag.toLowerCase()])
    })

    const result = await publishStation(ndk as any, event, [
        'client',
        'Wavefunc',
        `31990:${VITE_APP_PUBKEY}:wavefuncstationshandler`,
        'wss://relay.wavefunc.live',
    ])
    // console.log(`✓ Published station: ${station.Name} with ${stationGroup.streams.length} streams (${result.id})`)
    return result
}

// Helper function to format time in minutes and seconds
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
}

// Generate a detailed report of the grouped stations and save to a file
async function generateStationReport(stationGroups: StationGroup[], stats: any): Promise<string> {
    const fs = require('fs')
    const path = require('path')
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
    const reportFileName = `station-report-${dateStr}.txt`

    let report = '=========================================\n'
    report += '  RADIO STATION GROUPING DETAILED REPORT\n'
    report += `  Generated: ${new Date().toLocaleString()}\n`
    report += '=========================================\n\n'

    // Overall statistics
    report += '===== GROUPING STATISTICS =====\n'
    report += `Total original stations: ${stats.totalGroups + stats.totalDuplicatesFound}\n`
    report += `Total unique station groups: ${stats.totalGroups}\n`
    report += `Total duplicates found: ${stats.totalDuplicatesFound}\n`
    report += `Average streams per station: ${((stats.totalGroups + stats.totalDuplicatesFound) / stats.totalGroups).toFixed(2)}\n`
    report += `Largest group: "${stats.largestGroupName}" with ${stats.largestGroupSize} stations\n\n`

    // Group size distribution
    report += 'Group size distribution:\n'
    Object.entries(stats.groupSizes)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .forEach(([size, count]) => {
            report += `  ${size} stream${Number(size) > 1 ? 's' : ''}: ${count} station${Number(count) > 1 ? 's' : ''}\n`
        })

    // Groups with multiple streams (sorted by size, largest first)
    const multiStreamGroups = stationGroups
        .filter((g) => g.streams.length > 1)
        .sort((a, b) => b.streams.length - a.streams.length)

    report += `\n===== MULTI-STREAM GROUPS (${multiStreamGroups.length} total) =====\n`

    // List all multi-stream groups with basic info
    multiStreamGroups.forEach((group, idx) => {
        report += `\n[Group ${idx + 1}] ${group.mainStation.Name} (${group.streams.length} streams)\n`
        report += `  Main URL: ${group.mainStation.Url}\n`
        report += `  Country: ${group.mergedMetadata.Country || 'N/A'} (${group.mergedMetadata.CountryCode || 'N/A'})\n`

        // List all streams in the group
        report += `  Streams:\n`
        group.streams.forEach((stream, streamIdx) => {
            report += `    ${streamIdx + 1}. ${stream.url} (${stream.quality.bitrate / 1000}kbps ${stream.quality.codec})\n`
        })

        report += `  Similar stations:\n`
        if (group.similarStations.length === 0) {
            report += `    None (single station with multiple streams)\n`
        } else {
            group.similarStations.forEach((similar, simIdx) => {
                report += `    ${simIdx + 1}. ${similar.Name} - ${similar.Url}\n`
            })
        }
    })

    // Top 50 largest groups with detailed info
    const top50 = multiStreamGroups.slice(0, 50)
    report += `\n\n===== TOP 50 LARGEST GROUPS (DETAILED) =====\n`

    top50.forEach((group, idx) => {
        report += `\n=======================================\n`
        report += `Group ${idx + 1}: ${group.mainStation.Name} (${group.streams.length} streams)\n`
        report += `Main station: ${group.mainStation.Name} - ${group.mainStation.Url}\n`

        if (group.similarStations.length > 0) {
            report += `Similar stations:\n`
            group.similarStations.forEach((similar, simIdx) => {
                report += `  ${simIdx + 1}. ${similar.Name} - ${similar.Url}\n`
            })
        }

        report += `Streams:\n`
        group.streams.forEach((stream, streamIdx) => {
            report += `  ${streamIdx + 1}. ${stream.url} (${stream.quality.bitrate / 1000}kbps ${stream.quality.codec})\n`
        })

        // Print merged metadata
        report += `Merged metadata:\n`
        report += `  Homepage: ${group.mergedMetadata.Homepage || 'N/A'}\n`
        report += `  Favicon: ${group.mergedMetadata.Favicon || 'N/A'}\n`
        report += `  Tags: ${Array.from(group.mergedMetadata.Tags).join(', ') || 'N/A'}\n`
        report += `  Country: ${group.mergedMetadata.Country || 'N/A'} (${group.mergedMetadata.CountryCode || 'N/A'})\n`
        report += `  Language: ${group.mergedMetadata.Language || 'N/A'}\n`
        report += `  Language Codes: ${Array.from(group.mergedMetadata.LanguageCodes).join(', ') || 'N/A'}\n`
    })

    // Write the report to a file
    fs.writeFileSync(path.join(__dirname, reportFileName), report)

    return reportFileName
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

        // Generate and save station report
        console.log('\n===== Generating Station Report =====')
        const reportFileName = await generateStationReport(stationGroups, stats)
        console.log(`Detailed report saved to: ${reportFileName}`)

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

main().catch(console.error)
