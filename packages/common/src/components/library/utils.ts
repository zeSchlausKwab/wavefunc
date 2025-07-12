import type { YouTubeThumbnail } from './types'

/**
 * Extract the best thumbnail URL from YouTube's thumbnail structure
 * Prioritizes higher resolution thumbnails
 */
export function getBestThumbnailUrl(thumbnail: string | { thumbnails: YouTubeThumbnail[] } | undefined): string | null {
    if (!thumbnail) return null

    // If it's already a string URL, return it
    if (typeof thumbnail === 'string') return thumbnail

    // If it has thumbnails array, find the best one
    if (thumbnail.thumbnails && Array.isArray(thumbnail.thumbnails)) {
        // Sort by width descending to get the highest resolution
        const sortedThumbnails = thumbnail.thumbnails.sort((a, b) => b.width - a.width)
        return sortedThumbnails[0]?.url || null
    }

    return null
}

export function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`
}

export function extractSearchResults(data: any, searchType: string): any[] {
    if (!data) return []

    // Handle direct arrays
    if (Array.isArray(data)) return data

    // Handle YouTube search results
    if (searchType === 'youtube' && data.results && Array.isArray(data.results)) {
        return data.results
    }

    // Handle nested data structures
    const resultKey = getResultKey(searchType)
    if (data[resultKey] && Array.isArray(data[resultKey])) {
        return data[resultKey]
    }

    // Handle wrapped data
    if (data.data) {
        return extractSearchResults(data.data, searchType)
    }

    return []
}

function getResultKey(searchType: string): string {
    switch (searchType) {
        case 'discogs':
            return 'results'
        case 'recording':
            return 'recordings'
        case 'release':
            return 'releases'
        case 'artist':
            return 'artists'
        case 'label':
            return 'labels'
        case 'youtube':
            return 'results'
        default:
            return 'results'
    }
}

export function buildSearchArgs(searchType: string, formData: any): Record<string, any> {
    switch (searchType) {
        case 'discogs':
            return {
                artist: formData.artist,
                title: formData.title,
                type: formData.type || 'release',
                per_page: formData.per_page || '10',
                page: formData.page || '1',
            }
        case 'youtube':
            return {
                query: formData.query || `${formData.artist} ${formData.title}`.trim(),
                type: formData.youtubeType || 'video',
                limit: parseInt(formData.limit || '10'),
            }
        case 'recording':
            return {
                artist: formData.artist,
                title: formData.title,
                limit: formData.limit || '10',
                offset: formData.offset || '0',
            }
        case 'artist':
            return {
                name: formData.artist,
                limit: formData.limit || '10',
                offset: formData.offset || '0',
            }
        case 'label':
            return {
                name: formData.artist, // Using artist field for label name
                limit: formData.limit || '10',
                offset: formData.offset || '0',
            }
        default: // release
            return {
                artist: formData.artist,
                title: formData.title,
                limit: formData.limit || '10',
                offset: formData.offset || '0',
                ...(formData.type && { type: formData.type }),
                ...(formData.status && { status: formData.status }),
            }
    }
}

export function getToolName(searchType: string): string {
    switch (searchType) {
        case 'discogs':
            return 'discogs-search'
        case 'youtube':
            return 'youtube-search'
        case 'recording':
            return 'musicbrainz-search-recording'
        case 'artist':
            return 'musicbrainz-search-artist'
        case 'label':
            return 'musicbrainz-search-label'
        default:
            return 'musicbrainz-search-release'
    }
}

export function getLookupToolName(searchType: string): string {
    switch (searchType) {
        case 'discogs':
            return 'discogs-release'
        case 'youtube':
            return 'youtube-video-details'
        case 'recording':
            return 'musicbrainz-get-recording'
        case 'artist':
            return 'musicbrainz-get-artist'
        case 'label':
            return 'musicbrainz-get-label'
        default:
            return 'musicbrainz-get-release'
    }
}

export function buildLookupArgs(searchType: string, id: string): Record<string, any> {
    switch (searchType) {
        case 'discogs':
            return { releaseId: id }
        case 'youtube':
            return { videoId: id }
        case 'recording':
            return {
                recordingId: id,
                inc: 'artists,releases,artist-credits,tags,isrcs',
            }
        case 'artist':
            return {
                artistId: id,
                inc: 'releases,recordings,release-groups,works,tags,aliases',
            }
        case 'label':
            return {
                labelId: id,
                inc: 'releases,artists,tags,aliases',
            }
        default: // release
            return {
                releaseId: id,
                inc: 'artists,recordings,release-groups,labels,media,cover-art-archive,tags',
            }
    }
}
