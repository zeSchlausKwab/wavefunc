/**
 * Composable Music Metadata Service
 * Provides unified access to music recognition and metadata APIs
 */

export interface MusicRecognitionResult {
    artist?: string
    title?: string
    album?: string
    release_date?: string
    label?: string
    timecode?: string
    song_link?: string
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

export interface EnrichedMusicMetadata {
    recognition?: MusicRecognitionResult
    discogs?: any
    musicbrainz?: {
        recording?: any
        release?: any
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

        const response = await fetch('https://api.audd.io/', {
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

        const response = await fetch(`https://api.discogs.com/database/search?${searchParams}`, {
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

        const response = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
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
            'User-Agent': 'WaveFunc/1.0 (https://wavefunc.live)',
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

        const response = await fetch(`https://musicbrainz.org/ws/2/recording?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/release?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/recording/${recordingId}?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/release/${releaseId}?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/artist?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/artist/${artistId}?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/label?${searchParams}`, {
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

        const response = await fetch(`https://musicbrainz.org/ws/2/label/${labelId}?${searchParams}`, {
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

    // Music Recognition
    async recognizeMusic(audioUrl: string): Promise<MusicRecognitionResult | null> {
        if (!this.auddClient) {
            throw new Error('AudD client not configured')
        }
        return this.auddClient.recognize(audioUrl)
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
                    })
                    .catch((error) => console.warn('Discogs enrichment failed:', error)),
            )
        }

        // Enrich with MusicBrainz
        promises.push(
            Promise.all([
                this.searchMusicBrainzRecordings(recognition.artist, recognition.title, { limit: 1 }).catch((error) => {
                    console.warn('MusicBrainz recording search failed:', error)
                    return null
                }),
                this.searchMusicBrainzReleases(recognition.artist, recognition.title, { limit: 1 }).catch((error) => {
                    console.warn('MusicBrainz release search failed:', error)
                    return null
                }),
            ]).then(([recording, release]) => {
                result.musicbrainz = { recording, release }
            }),
        )

        await Promise.all(promises)
        return result
    }

    // Convenience method for full recognition + enrichment
    async recognizeAndEnrich(audioUrl: string): Promise<EnrichedMusicMetadata> {
        const recognition = await this.recognizeMusic(audioUrl)
        if (!recognition) {
            return {}
        }
        return this.enrichWithMetadata(recognition)
    }
}

// Factory function for easy instantiation
export function createMusicMetadataService(config: {
    auddToken?: string
    discogsToken?: string
}): MusicMetadataService {
    return new MusicMetadataService(config)
}
