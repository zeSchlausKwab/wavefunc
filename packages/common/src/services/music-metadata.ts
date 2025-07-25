/**
 * Composable Music Metadata Service
 * Provides unified access to music recognition and metadata APIs
 */

import { config } from '../config'

// Logging utility that works in both browser and server environments
const log = (message: string) => {
    if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(message)
    } else {
        console.log(message.replace(/\n$/, ''))
    }
}

export interface MusicRecognitionResult {
    artist?: string
    title?: string
    album?: string
    release_date?: string
    label?: string
    timecode?: string
    song_link?: string
    youtube_link?: string
    apple_music?: {
        previews?: Array<{ url: string }>
        artwork?: { url: string }
        url?: string
    }
    spotify?: {
        external_urls?: { spotify: string }
        preview_url?: string
        album?: {
            images?: Array<{ url: string }>
        }
    }
}

export interface MusicBrainzRecordingResponse {
    created: string
    count: number
    offset: number
    recordings: Array<{
        id: string
        score: number
        title: string
        length?: number
        disambiguation?: string
        'artist-credit': Array<{
            name: string
            artist: {
                id: string
                name: string
                'sort-name': string
                disambiguation?: string
            }
        }>
        releases?: Array<{
            id: string
            title: string
            status: string
            'release-group': {
                id: string
                title: string
                'primary-type': string
                'secondary-types'?: string[]
            }
        }>
    }>
}

export interface MusicBrainzReleaseResponse {
    created: string
    count: number
    offset: number
    releases: Array<{
        id: string
        score: number
        title: string
        status: string
        date?: string
        country?: string
        'artist-credit': Array<{
            name: string
            joinphrase?: string
            artist: {
                id: string
                name: string
                'sort-name': string
                disambiguation?: string
            }
        }>
        'release-group': {
            id: string
            title: string
            'primary-type': string
            'secondary-types'?: string[]
        }
        'label-info'?: Array<{
            'catalog-number'?: string
            label: {
                id: string
                name: string
            }
        }>
        media?: Array<{
            id: string
            format?: string
            'track-count': number
        }>
    }>
}

export interface EnrichedMusicMetadata {
    recognition?: MusicRecognitionResult
    discogs?: any
    musicbrainz?: {
        recording?: MusicBrainzRecordingResponse
        release?: MusicBrainzReleaseResponse
    }
}

export interface MusicSearchOptions {
    limit?: number
    offset?: number
    type?: string
    status?: string
    per_page?: number
    page?: number
}

/**
 * AudD API Client for music recognition
 */
export class AuddClient {
    constructor(private apiToken: string) {}

    async recognize(audioUrl: string): Promise<MusicRecognitionResult | null> {
        const formData = new FormData()
        formData.append('api_token', this.apiToken)
        formData.append('url', audioUrl)
        formData.append('return', 'apple_music,spotify')

        const response = await fetch(config.audd.apiUrl, {
            method: 'POST',
            body: formData,
        })

        if (!response.ok) {
            throw new Error(`AudD API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        if (data.status === 'success' && data.result) {
            return data.result
        } else if (data.error) {
            throw new Error(data.error.error_message || 'AudD recognition failed')
        }

        return null
    }
}

/**
 * Discogs API Client
 */
export class DiscogsClient {
    constructor(private token: string) {}

    private getHeaders(): HeadersInit {
        return {
            'User-Agent': 'WaveFunc/1.0',
            Accept: 'application/vnd.discogs.v2.discogs+json',
            Authorization: `Discogs token=${this.token}`,
        }
    }

    async search(query: string, options: MusicSearchOptions = {}): Promise<any> {
        const { type = 'release', per_page = 10, page = 1 } = options

        const searchParams = new URLSearchParams({
            q: query,
            type,
            per_page: per_page.toString(),
            page: page.toString(),
        })

        const response = await fetch(`${config.discogs.apiUrl}database/search?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`Discogs API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async searchByArtistAndTitle(artist: string, title: string, options: MusicSearchOptions = {}): Promise<any> {
        return this.search(`${artist} ${title}`, options)
    }

    async getRelease(releaseId: string): Promise<any> {
        if (!releaseId || isNaN(Number(releaseId))) {
            throw new Error('Invalid release ID')
        }

        const response = await fetch(`${config.discogs.apiUrl}releases/${releaseId}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`Discogs API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }
}

/**
 * MusicBrainz API Client
 */
export class MusicBrainzClient {
    private lastRequestTime = 0

    private getHeaders(): HeadersInit {
        return {
            'User-Agent': `${config.app.userAgent} (${config.app.baseUrl})`,
            Accept: 'application/json',
        }
    }

    private async rateLimit(): Promise<void> {
        const now = Date.now()
        const timeSinceLastRequest = now - this.lastRequestTime
        if (timeSinceLastRequest < 1000) {
            await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLastRequest))
        }
        this.lastRequestTime = Date.now()
    }

    async searchRecordings(artist: string, title: string, options: MusicSearchOptions = {}): Promise<any> {
        await this.rateLimit()

        const { limit = 10, offset = 0 } = options
        const query = `recording:"${title}" AND artist:"${artist}"`

        const searchParams = new URLSearchParams({
            query,
            limit: limit.toString(),
            offset: offset.toString(),
            fmt: 'json',
        })

        const response = await fetch(`${config.musicbrainz.apiUrl}recording?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async searchReleases(artist: string, title: string, options: MusicSearchOptions = {}): Promise<any> {
        await this.rateLimit()

        const { limit = 10, offset = 0, type, status } = options
        let query = `release:"${title}" AND artist:"${artist}"`

        if (type) query += ` AND type:"${type}"`
        if (status) query += ` AND status:"${status}"`

        const searchParams = new URLSearchParams({
            query,
            limit: limit.toString(),
            offset: offset.toString(),
            fmt: 'json',
        })

        const response = await fetch(`${config.musicbrainz.apiUrl}release?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async getRecording(recordingId: string, includes?: string[]): Promise<any> {
        await this.rateLimit()

        if (!recordingId) {
            throw new Error('Recording ID is required')
        }

        const searchParams = new URLSearchParams({ fmt: 'json' })
        if (includes?.length) {
            searchParams.set('inc', includes.join('+'))
        }

        const response = await fetch(`${config.musicbrainz.apiUrl}recording/${recordingId}?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async getRelease(releaseId: string, includes?: string[]): Promise<any> {
        await this.rateLimit()

        if (!releaseId) {
            throw new Error('Release ID is required')
        }

        const searchParams = new URLSearchParams({ fmt: 'json' })
        if (includes?.length) {
            searchParams.set('inc', includes.join('+'))
        }

        const response = await fetch(`${config.musicbrainz.apiUrl}release/${releaseId}?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async searchArtists(name: string, options: MusicSearchOptions = {}): Promise<any> {
        await this.rateLimit()

        const { limit = 10, offset = 0 } = options
        const query = `artist:"${name}"`

        const searchParams = new URLSearchParams({
            query,
            limit: limit.toString(),
            offset: offset.toString(),
            fmt: 'json',
        })

        const response = await fetch(`${config.musicbrainz.apiUrl}artist?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async getArtist(artistId: string, includes?: string[]): Promise<any> {
        await this.rateLimit()

        if (!artistId) {
            throw new Error('Artist ID is required')
        }

        const searchParams = new URLSearchParams({ fmt: 'json' })
        if (includes?.length) {
            searchParams.set('inc', includes.join('+'))
        }

        const response = await fetch(`${config.musicbrainz.apiUrl}artist/${artistId}?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async searchLabels(name: string, options: MusicSearchOptions = {}): Promise<any> {
        await this.rateLimit()

        const { limit = 10, offset = 0 } = options
        const query = `label:"${name}"`

        const searchParams = new URLSearchParams({
            query,
            limit: limit.toString(),
            offset: offset.toString(),
            fmt: 'json',
        })

        const response = await fetch(`${config.musicbrainz.apiUrl}label?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }

    async getLabel(labelId: string, includes?: string[]): Promise<any> {
        await this.rateLimit()

        if (!labelId) {
            throw new Error('Label ID is required')
        }

        const searchParams = new URLSearchParams({ fmt: 'json' })
        if (includes?.length) {
            searchParams.set('inc', includes.join('+'))
        }

        const response = await fetch(`${config.musicbrainz.apiUrl}label/${labelId}?${searchParams}`, {
            headers: this.getHeaders(),
        })

        if (!response.ok) {
            throw new Error(`MusicBrainz API error: ${response.status} ${response.statusText}`)
        }

        return response.json()
    }
}

/**
 * Composable Music Metadata Service
 */
export class MusicMetadataService {
    private auddClient?: AuddClient
    private discogsClient?: DiscogsClient
    private musicbrainzClient: MusicBrainzClient

    constructor(config: { auddToken?: string; discogsToken?: string }) {
        if (config.auddToken) {
            this.auddClient = new AuddClient(config.auddToken)
        }
        if (config.discogsToken) {
            this.discogsClient = new DiscogsClient(config.discogsToken)
        }
        this.musicbrainzClient = new MusicBrainzClient()
    }

    // Discogs Methods
    async searchDiscogs(artist: string, title: string, options?: MusicSearchOptions): Promise<any> {
        if (!this.discogsClient) {
            throw new Error('Discogs client not configured')
        }
        return this.discogsClient.searchByArtistAndTitle(artist, title, options)
    }

    async getDiscogsRelease(releaseId: string): Promise<any> {
        if (!this.discogsClient) {
            throw new Error('Discogs client not configured')
        }
        return this.discogsClient.getRelease(releaseId)
    }

    // MusicBrainz Methods
    async searchMusicBrainzRecordings(artist: string, title: string, options?: MusicSearchOptions): Promise<any> {
        return this.musicbrainzClient.searchRecordings(artist, title, options)
    }

    async searchMusicBrainzReleases(artist: string, title: string, options?: MusicSearchOptions): Promise<any> {
        return this.musicbrainzClient.searchReleases(artist, title, options)
    }

    async getMusicBrainzRecording(recordingId: string, includes?: string[]): Promise<any> {
        return this.musicbrainzClient.getRecording(recordingId, includes)
    }

    async getMusicBrainzRelease(releaseId: string, includes?: string[]): Promise<any> {
        return this.musicbrainzClient.getRelease(releaseId, includes)
    }

    async searchMusicBrainzArtists(name: string, options?: MusicSearchOptions): Promise<any> {
        return this.musicbrainzClient.searchArtists(name, options)
    }

    async getMusicBrainzArtist(artistId: string, includes?: string[]): Promise<any> {
        return this.musicbrainzClient.getArtist(artistId, includes)
    }

    async searchMusicBrainzLabels(name: string, options?: MusicSearchOptions): Promise<any> {
        return this.musicbrainzClient.searchLabels(name, options)
    }

    async getMusicBrainzLabel(labelId: string, includes?: string[]): Promise<any> {
        return this.musicbrainzClient.getLabel(labelId, includes)
    }

    // Enrichment Methods
    async enrichWithMetadata(recognition: MusicRecognitionResult): Promise<EnrichedMusicMetadata> {
        const result: EnrichedMusicMetadata = { recognition }

        if (!recognition.artist || !recognition.title) {
            return result
        }

        // Parallel enrichment
        const promises: Promise<void>[] = []

        // Enrich with Discogs
        if (this.discogsClient) {
            promises.push(
                this.searchDiscogs(recognition.artist, recognition.title, { limit: 1 })
                    .then((data) => {
                        result.discogs = data
                        log(`[MusicMetadata] Discogs enrichment successful\n`)
                    })
                    .catch((error) => {
                        log(`[MusicMetadata] Discogs enrichment failed: ${error}\n`)
                    }),
            )
        }

        // Enrich with MusicBrainz
        promises.push(
            Promise.all([
                this.searchMusicBrainzRecordings(recognition.artist, recognition.title, { limit: 1 }).catch((error) => {
                    log(`[MusicMetadata] MusicBrainz recording search failed: ${error}\n`)
                    return null
                }),
                this.searchMusicBrainzReleases(recognition.artist, recognition.title, { limit: 1 }).catch((error) => {
                    log(`[MusicMetadata] MusicBrainz release search failed: ${error}\n`)
                    return null
                }),
            ]).then(([recording, release]) => {
                result.musicbrainz = { recording, release }
                log(`[MusicMetadata] MusicBrainz enrichment completed\n`)
            }),
        )

        await Promise.all(promises)
        return result
    }

    // Resolve lis.tn URLs to extract YouTube links
    async resolveLisTnUrl(lisTnUrl: string): Promise<string | null> {
        try {
            const response = await fetch(lisTnUrl, {
                method: 'GET',
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            })

            if (!response.ok) {
                log(`[MusicMetadata] Failed to fetch lis.tn URL: ${response.status}\n`)
                return null
            }

            const html = await response.text()

            const youtubePatterns = [
                /href="(https:\/\/(?:www\.)?youtube\.com\/watch\?v=[^"]+)"/gi,
                /href="(https:\/\/youtu\.be\/[^"]+)"/gi,
                /"(https:\/\/(?:www\.)?youtube\.com\/watch\?v=[^"]+)"/gi,
                /"(https:\/\/youtu\.be\/[^"]+)"/gi,
            ]

            for (const pattern of youtubePatterns) {
                const match = pattern.exec(html)
                if (match && match[1]) {
                    log(`[MusicMetadata] Found YouTube link: ${match[1]}\n`)
                    return match[1]
                }
            }

            // If no direct YouTube link found, look for any YouTube URL in the text
            const youtubeUrlMatch = html.match(
                /https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+|https:\/\/youtu\.be\/[\w-]+/,
            )
            if (youtubeUrlMatch) {
                return youtubeUrlMatch[0]
            }

            return null
        } catch (error) {
            log(`[MusicMetadata] Error resolving lis.tn URL: ${error}\n`)
            return null
        }
    }

    // Enhanced recognition that also resolves lis.tn URLs
    async recognizeMusic(audioUrl: string): Promise<MusicRecognitionResult | null> {
        if (!this.auddClient) {
            throw new Error('AudD client not configured')
        }

        const result = await this.auddClient.recognize(audioUrl)

        if (result && result.song_link && result.song_link.includes('lis.tn')) {
            try {
                const youtubeLink = await this.resolveLisTnUrl(result.song_link)
                if (youtubeLink) {
                    result.youtube_link = youtubeLink
                    log(`[MusicMetadata] Successfully resolved YouTube link: ${youtubeLink}\n`)
                }
            } catch (error) {
                log(`[MusicMetadata] Error resolving lis.tn URL: ${error}\n`)
            }
        }

        return result
    }

    // Convenience method for full recognition + enrichment
    async recognizeAndEnrich(audioUrl: string): Promise<EnrichedMusicMetadata> {
        const recognition = await this.recognizeMusic(audioUrl)
        if (!recognition) {
            return {}
        }
        const enriched = await this.enrichWithMetadata(recognition)
        return enriched
    }
}

// Factory function for easy instantiation
export function createMusicMetadataService(config: {
    auddToken?: string
    discogsToken?: string
}): MusicMetadataService {
    return new MusicMetadataService(config)
}
