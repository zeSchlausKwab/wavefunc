// Music metadata types for different sources

export type SearchType = 'recording' | 'release' | 'artist' | 'label' | 'discogs' | 'youtube'

export interface SearchFormData {
    artist: string
    title: string
    type?: string
    limit?: string
    offset?: string
    page?: string
    per_page?: string
    status?: string
    query?: string // For YouTube search
    youtubeType?: 'video' | 'channel' | 'playlist' | 'all' // For YouTube search type
}

// Base interfaces for different entity types
export interface BaseResult {
    id?: string
    title?: string
    score?: number
    disambiguation?: string
}

// MusicBrainz Artist Credit
export interface ArtistCredit {
    name: string
    artist?: {
        id: string
        name: string
        sort_name?: string
    }
    joinphrase?: string
}

// MusicBrainz Recording
export interface Recording extends BaseResult {
    length?: number
    'artist-credit'?: ArtistCredit[]
    releases?: Release[]
    isrcs?: string[]
    tags?: Tag[]
}

// MusicBrainz Release
export interface Release extends BaseResult {
    'artist-credit'?: ArtistCredit[]
    date?: string
    country?: string
    status?: string
    packaging?: string
    barcode?: string
    'text-representation'?: {
        language?: string
        script?: string
    }
    'label-info'?: LabelInfo[]
    media?: Media[]
    'cover-art-archive'?: {
        artwork: boolean
        count: number
        front: boolean
        back: boolean
    }
    'release-group'?: {
        id: string
        title: string
        'primary-type': string
        'secondary-types'?: string[]
    }
}

// MusicBrainz Artist
export interface Artist extends BaseResult {
    name: string
    'sort-name'?: string
    type?: string
    gender?: string
    country?: string
    'begin-area'?: Area
    'end-area'?: Area
    'life-span'?: {
        begin?: string
        end?: string
        ended?: boolean
    }
    aliases?: Alias[]
    tags?: Tag[]
    releases?: Release[]
    recordings?: Recording[]
    works?: Work[]
}

// MusicBrainz Label
export interface Label extends BaseResult {
    name: string
    'sort-name'?: string
    type?: string
    'label-code'?: number
    country?: string
    area?: Area
    'life-span'?: {
        begin?: string
        end?: string
        ended?: boolean
    }
    aliases?: Alias[]
    tags?: Tag[]
    releases?: Release[]
}

// Discogs Release
export interface DiscogsRelease extends BaseResult {
    artist?: string
    year?: number
    genre?: string[]
    style?: string[]
    label?: string[]
    catno?: string
    format?: string[]
    thumb?: string
    cover_image?: string
    uri?: string
    resource_url?: string
    master_id?: number
    master_url?: string
    community?: {
        want: number
        have: number
        rating?: {
            count: number
            average: number
        }
    }
    country?: string
    notes?: string
    data_quality?: string
    videos?: Video[]
    tracklist?: Track[]
    identifiers?: Identifier[]
    companies?: Company[]
}

// Supporting types
export interface Area {
    id: string
    name: string
    'sort-name'?: string
    type?: string
    'iso-3166-1-codes'?: string[]
}

export interface Alias {
    name: string
    'sort-name'?: string
    type?: string
    primary?: boolean
    locale?: string
}

export interface Tag {
    name: string
    count: number
}

export interface Work {
    id: string
    title: string
    type?: string
    disambiguation?: string
}

export interface LabelInfo {
    'catalog-number'?: string
    label?: {
        id: string
        name: string
    }
}

export interface Media {
    title?: string
    format?: string
    'disc-count'?: number
    'track-count'?: number
    tracks?: Track[]
}

export interface Track {
    id?: string
    title: string
    length?: number
    number?: string
    position?: string
    recording?: Recording
}

export interface Video {
    uri: string
    title: string
    description?: string
    duration?: number
}

export interface Identifier {
    type: string
    value: string
    description?: string
}

export interface Company {
    name: string
    catno?: string
    entity_type: string
    entity_type_name: string
    id: number
    resource_url: string
}

// YouTube types
export interface YouTubeThumbnail {
    url: string
    width: number
    height: number
}

export interface YouTubeVideo extends BaseResult {
    type: 'video' | 'channel' | 'playlist'
    description?: string
    thumbnail?:
        | string
        | {
              thumbnails: YouTubeThumbnail[]
          }
    duration?: string
    publishedTime?: string
    viewCount?: string
    channelTitle?: string
    channelId?: string
    url?: string
    embedUrl?: string
}

export interface YouTubeVideoDetails extends BaseResult {
    description?: string
    thumbnail?:
        | string
        | {
              thumbnails: YouTubeThumbnail[]
          }
    duration?: string | number
    publishDate?: string
    viewCount?: string | number
    likeCount?: string | number
    channelTitle?: string
    channelId?: string
    tags?: string[]
    category?: string
    url?: string
    embedUrl?: string
}

// Union type for all possible search results
export type SearchResult = Recording | Release | Artist | Label | DiscogsRelease | YouTubeVideo

export interface ToolResult {
    tool: string
    data: any
    timestamp: number
    cost?: string
}
