import { z } from 'zod'

// Stream quality schema
export const StreamQualitySchema = z.object({
    bitrate: z.number().positive('Bitrate must be a positive number'),
    codec: z.string().min(1, 'Codec is required'),
    sampleRate: z.number().positive('Sample rate must be a positive number'),
})

// Stream schema
export const StreamSchema = z.object({
    url: z.string().url('Must be a valid URL'),
    format: z.string().min(1, 'Format is required'),
    quality: StreamQualitySchema,
    primary: z.boolean().optional(),
})

// Radio station event content schema - includes streams and markdown description
export const RadioEventContentSchema = z.object({
    streams: z.array(StreamSchema).min(1, 'At least one stream is required'),
    description: z.string().min(1, 'Description is required'),
})

// Radio station metadata schema (extracted from tags)
export const RadioMetadataSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    website: z.string().url().optional(),
    location: z.string().optional(),
    countryCode: z.string().optional(),
    languageCodes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    thumbnail: z.string().url().optional(),
})

// Favorites list content schema
export const FavoritesEventContentSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().min(1, 'Description is required'),
})

// Schema for a favorite item extracted from an 'a' tag
export const FavoriteItemSchema = z.object({
    event_id: z.string(),
    relay_url: z.string().optional(),
    petname: z.string().optional(),
    added_at: z.number().optional(),
})
