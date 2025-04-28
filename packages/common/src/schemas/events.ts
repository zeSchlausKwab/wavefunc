import { NDKKind } from '@nostr-dev-kit/ndk'
import { z } from 'zod'

// Define the constants here to avoid circular dependencies
export const RADIO_EVENT_KINDS = {
    STREAM: 31237,
} as const

// Base Nostr Event Schema
export const NostrEventBaseSchema = z.object({
    id: z.string().optional(), // Will be computed when signed
    pubkey: z.string(),
    created_at: z.number().int().positive(),
    kind: z.number().int().positive(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    sig: z.string().optional(), // Will be computed when signed
})

// Base schema for all tag types
export const TagSchema = z.tuple([z.string(), z.string()]).rest(z.string())

// Common tag schemas
export const NameTagSchema = z.tuple([z.literal('name'), z.string()])
export const DescriptionTagSchema = z.tuple([z.literal('description'), z.string()])
export const DTagSchema = z.tuple([z.literal('d'), z.string()])
export const ThumbnailTagSchema = z.tuple([z.literal('thumbnail'), z.string().url()])
export const TopicTagSchema = z.tuple([z.literal('t'), z.string()])
export const LanguageTagSchema = z.tuple([z.literal('l'), z.string()])
export const CountryCodeTagSchema = z.tuple([z.literal('countryCode'), z.string()])
export const WebsiteTagSchema = z.tuple([z.literal('website'), z.string().url()])
export const LocationTagSchema = z.tuple([z.literal('location'), z.string()])
export const ClientTagSchema = z.tuple([
    z.literal('client'),
    z.string(),
    z.string(), // Client identifier
    z.string().url().optional(), // Relay URL (optional)
])

// Favorite station 'a' tag schema - ['a', event_id, relay_url?, petname?, added_at?]
export const FavoriteATagSchema = z
    .tuple([
        z.literal('a'),
        z.string(), // event_id
        z.string().optional(), // relay_url (optional)
        z.string().optional(), // petname (optional)
        z.string().optional(), // added_at (optional) as string timestamp
    ])
    .rest(z.string()) // allow additional elements if needed

// Stream quality schema
export const StreamQualitySchema = z.object({
    bitrate: z.number().int().positive(),
    codec: z.string().min(1),
    sampleRate: z.number().int().positive(),
})

// Stream schema
export const StreamSchema = z.object({
    url: z.string().url(),
    format: z.string().min(1),
    quality: StreamQualitySchema,
    primary: z.boolean().optional().default(false),
})

// Updated Radio station event content schema - includes streams and markdown description
export const RadioEventContentSchema = z.object({
    streams: z.array(StreamSchema).min(1, 'At least one stream is required'),
    description: z.string().min(1, 'Description is required'),
})

// Radio Station Event (kind 31237)
export const RadioStationEventSchema = NostrEventBaseSchema.extend({
    kind: z.literal(RADIO_EVENT_KINDS.STREAM),
    content: z.string().refine(
        (content) => {
            try {
                const parsed = JSON.parse(content)
                return RadioEventContentSchema.safeParse(parsed).success
            } catch {
                return false
            }
        },
        { message: 'Invalid radio station content' },
    ),
    tags: z.array(
        z.union([
            NameTagSchema, // Required
            DTagSchema, // Required
            ThumbnailTagSchema,
            WebsiteTagSchema,
            TopicTagSchema,
            LanguageTagSchema,
            CountryCodeTagSchema,
            LocationTagSchema,
            ClientTagSchema,
            TagSchema, // Allow other tags
        ]),
    ),
})

// Updated Favorites Event Content Schema (kind 30078)
// Now only includes the list name and description, not the favorites
export const FavoritesEventContentSchema = z.object({
    name: z.string().min(1),
    description: z.string(),
})

// Favorites Event (kind 30078)
export const FavoritesEventSchema = NostrEventBaseSchema.extend({
    kind: z.literal(NDKKind.AppSpecificData),
    content: z.string().refine(
        (content) => {
            try {
                const parsed = JSON.parse(content)
                return FavoritesEventContentSchema.safeParse(parsed).success
            } catch {
                return false
            }
        },
        { message: 'Invalid favorites list content' },
    ),
    tags: z.array(
        z.union([
            NameTagSchema,
            DescriptionTagSchema,
            DTagSchema,
            FavoriteATagSchema, // Add favorites as 'a' tags
            ClientTagSchema,
            TagSchema, // Allow other tags
        ]),
    ),
})

// NIP-89 Handler Content Schema
export const HandlerContentSchema = z.object({
    name: z.string().min(1),
    display_name: z.string().min(1),
    picture: z.string().url(),
    about: z.string(),
    nip90: z
        .object({
            content: z.array(z.string()),
        })
        .optional(),
})

// Handler Event (kind 31990)
export const HandlerEventSchema = NostrEventBaseSchema.extend({
    kind: z.literal(NDKKind.AppHandler),
    content: z.string().refine(
        (content) => {
            try {
                const parsed = JSON.parse(content)
                return HandlerContentSchema.safeParse(parsed).success
            } catch {
                return false
            }
        },
        { message: 'Invalid handler content' },
    ),
    tags: z.array(
        z.union([
            DTagSchema,
            z.tuple([z.literal('k'), z.string()]), // Kind that this handler handles
            z.tuple([z.literal('web'), z.string(), z.string().optional()]), // Web URL tag
            TagSchema, // Allow other tags
        ]),
    ),
})

// Define inferred types for use in the application
export type NostrEventBase = z.infer<typeof NostrEventBaseSchema>
export type RadioEventContent = z.infer<typeof RadioEventContentSchema>
export type RadioStationEvent = z.infer<typeof RadioStationEventSchema>
export type FavoritesEventContent = z.infer<typeof FavoritesEventContentSchema>
export type FavoritesEvent = z.infer<typeof FavoritesEventSchema>
export type HandlerContent = z.infer<typeof HandlerContentSchema>
export type HandlerEvent = z.infer<typeof HandlerEventSchema>

// Helper function to parse and validate radio content
export function parseRadioContent(content: string): RadioEventContent | null {
    try {
        const parsed = JSON.parse(content)
        const result = RadioEventContentSchema.safeParse(parsed)
        return result.success ? result.data : null
    } catch {
        return null
    }
}

// Helper function to extract radio metadata from tags
export function extractRadioMetadataFromTags(tags: string[][]): {
    name?: string
    website?: string
    location?: string
    countryCode?: string
    languageCodes?: string[]
    tags?: string[]
    thumbnail?: string
} {
    const metadata: Record<string, any> = {
        languageCodes: [],
        tags: [],
    }

    tags.forEach((tag) => {
        switch (tag[0]) {
            case 'name':
                metadata.name = tag[1]
                break
            case 'website':
                metadata.website = tag[1]
                break
            case 'thumbnail':
                metadata.thumbnail = tag[1]
                break
            case 'countryCode':
                metadata.countryCode = tag[1]
                break
            case 'location':
                metadata.location = tag[1]
                break
            case 'l':
                metadata.languageCodes.push(tag[1])
                break
            case 't':
                metadata.tags.push(tag[1])
                break
        }
    })

    // Clean up empty arrays
    if (metadata.languageCodes.length === 0) delete metadata.languageCodes
    if (metadata.tags.length === 0) delete metadata.tags

    return metadata
}

// Helper function to parse and validate handler content
export function parseHandlerContent(content: string): HandlerContent | null {
    try {
        const parsed = JSON.parse(content)
        const result = HandlerContentSchema.safeParse(parsed)
        return result.success ? result.data : null
    } catch {
        return null
    }
}

// Helper function to parse and validate favorites content
export function parseFavoritesContent(content: string): FavoritesEventContent | null {
    try {
        const parsed = JSON.parse(content)
        const result = FavoritesEventContentSchema.safeParse(parsed)
        return result.success ? result.data : null
    } catch {
        return null
    }
}

// Helper function to extract favorites from 'a' tags
export function extractFavoritesFromTags(
    tags: string[][],
): Array<{ event_id: string; relay_url?: string; petname?: string; added_at?: number }> {
    return tags
        .filter((tag) => tag[0] === 'a')
        .map((tag) => {
            const event_id = tag[1]
            const relay_url = tag[2] || undefined
            const petname = tag[3] || undefined
            const added_at = tag[4] ? parseInt(tag[4], 10) : undefined // added_at is a string timestamp

            return { event_id, relay_url, petname, added_at }
        })
}

// Helper function to validate a complete radio station event
export function validateRadioStationEvent(event: any): boolean {
    return RadioStationEventSchema.safeParse(event).success
}

// Helper function to validate a complete handler event
export function validateHandlerEvent(event: any): boolean {
    return HandlerEventSchema.safeParse(event).success
}

// Helper function to validate a complete favorites event
export function validateFavoritesEvent(event: any): boolean {
    return FavoritesEventSchema.safeParse(event).success
}
