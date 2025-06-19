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
            id: string
            title: string
            length?: number
            disambiguation?: string
        }
        release?: {
            id: string
            title: string
            date?: string
            country?: string
            barcode?: string
            status?: string
        }
        artists?: Array<{
            id: string
            name: string
            'sort-name': string
            disambiguation?: string
        }>
        'release-group'?: {
            id: string
            title: string
            'primary-type': string
            'secondary-types'?: string[]
        }
        labels?: Array<{
            'catalog-number'?: string
            label?: {
                id: string
                name: string
            }
        }>
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
