export interface Stream {
    url: string
    format: string
    quality: {
        bitrate: number
        codec: string
        sampleRate: number
    }
    primary?: boolean
}
