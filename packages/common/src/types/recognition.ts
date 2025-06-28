export interface RecognitionResult {
    title: string
    artist: string
    album?: string
    release_date?: string
    song_link?: string
    apple_music?: {
        previews?: Array<{ url: string }>
        artwork?: {
            url: string
            width: number
            height: number
            bgColor?: string
            textColor1?: string
        }
        artistName?: string
        url?: string
        albumName?: string
        genreNames?: string[]
        durationInMillis?: number
        composerName?: string
    }
    spotify?: {
        album?: {
            artists?: Array<{
                name: string
                external_urls?: { spotify?: string }
            }>
            images?: Array<{
                url: string
                width: number
                height: number
            }>
            name?: string
            release_date?: string
        }
        external_urls?: {
            spotify?: string
        }
        name?: string
        duration_ms?: number
    }
    discogs?: {
        id: number
        title: string
        year?: number
        released?: string
        country?: string
        genres?: string[]
        styles?: string[]
        labels?: Array<{
            name: string
            catno: string
        }>
        formats?: Array<{
            name: string
            descriptions?: string[]
        }>
        images?: Array<{
            type: 'primary' | 'secondary'
            uri: string
            uri150: string
            width: number
            height: number
        }>
        lowest_price?: number
        uri?: string
        community?: {
            in_wantlist: number
            in_collection: number
        }
    }
    musicbrainz?: {
        recording?: {
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
        release?: {
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
    }
}

export interface MCPRecognitionResponse {
    result: RecognitionResult
}

export interface DVMRecognitionResponse {
    type: 'audd_response'
    requestId: string
    result: RecognitionResult
}
