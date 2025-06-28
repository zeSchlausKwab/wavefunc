// Utility functions for the music library

export function formatDuration(ms?: number): string | null {
    if (!ms || ms <= 0) return null
    const minutes = Math.floor(ms / 60000)
    const seconds = ((ms % 60000) / 1000).toFixed(0)
    return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`
}

export function extractSearchResults(data: any, searchType: string): any[] {
    if (!data) return []

    // Handle direct arrays
    if (Array.isArray(data)) return data

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
