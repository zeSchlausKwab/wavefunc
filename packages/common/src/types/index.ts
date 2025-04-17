// Nostr-specific types
export type NostrEvent = {
    id: string
    pubkey: string
    created_at: number
    kind: number
    tags: string[][]
    content: string
    sig: string
}

// Application specific types
export type RelayMetadata = {
    name: string
    url: string
    supported_nips?: number[]
    software?: string
    version?: string
}

// Export from station.ts
export type { Group, Station } from './station'

// Export from stream.ts
export type * from './stream'

// Export from radioBrowser.ts
export * from './radioBrowser'
