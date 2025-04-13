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
}

export interface MCPRecognitionResponse {
    result: RecognitionResult
}

export interface DVMRecognitionResponse {
    type: 'audd_response'
    requestId: string
    result: RecognitionResult
}
