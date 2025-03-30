export interface LegacyComment {
    id: number
    user: string
    text: string
    date: string
}

export interface Station {
    id: string
    naddr?: string
    name: string
    description: string
    website: string
    genre: string
    imageUrl: string
    countryCode?: string
    languageCodes?: string[]
    pubkey: string
    tags: string[][]
    streams: {
        url: string
        format: string
        quality: {
            bitrate: number
            codec: string
            sampleRate: number
        }
        primary?: boolean
    }[]
    created_at: number
}

export interface Group {
    id: number
    name: string
    description: string
    stationIds: number[]
}
