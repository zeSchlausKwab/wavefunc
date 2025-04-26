import type { NDKEvent } from '@nostr-dev-kit/ndk'

export interface Station {
    id: string
    naddr?: string
    name: string
    description: string
    website: string
    imageUrl: string
    countryCode?: string
    languageCodes?: string[]
    pubkey: string
    tags: string[][] // Format: [["t", "jazz"], ["t", "rock"], ["a", "nostr_radio"]]
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
    event?: NDKEvent
}

export interface Group {
    id: number
    name: string
    description: string
    stationIds: number[]
}
