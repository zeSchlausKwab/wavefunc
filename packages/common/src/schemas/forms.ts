import { z } from 'zod'
import { StreamQualitySchema, StreamSchema } from './station'

/**
 * Schema for validating radio station forms
 * This is specifically for UI forms, distinct from the Nostr event schemas
 */
export const StationFormSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().min(1, 'Description is required'),
    website: z.string().url('Must be a valid URL').or(z.literal('')),
    imageUrl: z.string().url('Must be a valid URL').or(z.literal('')),
    countryCode: z.string().max(10).optional(),
    languageCodes: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    streams: z.array(StreamSchema).min(1, 'At least one stream is required'),
})

/**
 * Schema for validating a single stream in a form
 */
export const StreamFormSchema = z.object({
    url: z.string().url('Must be a valid URL'),
    format: z.string().min(1, 'Format is required'),
    quality: z.object({
        bitrate: z.number().int().positive('Bitrate must be a positive number'),
        codec: z.string().min(1, 'Codec is required'),
        sampleRate: z.number().int().positive('Sample rate must be a positive number'),
    }),
    primary: z.boolean().default(false),
})

/**
 * Schema for validating the handler registration form
 */
export const HandlerFormSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    display_name: z.string().min(1, 'Display name is required'),
    picture: z.string().url('Must be a valid URL').or(z.literal('')),
    about: z.string().min(1, 'About text is required'),
})

/**
 * Schema for validating the favorites list form
 */
export const FavoritesFormSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string(),
    favorites: z
        .array(
            z.object({
                event_id: z.string(),
                name: z.string(),
            }),
        )
        .optional()
        .default([]),
})

// Define inferred types for use in forms
export type StationFormData = z.infer<typeof StationFormSchema>
export type StreamFormData = z.infer<typeof StreamFormSchema>
export type HandlerFormData = z.infer<typeof HandlerFormSchema>
export type FavoritesFormData = z.infer<typeof FavoritesFormSchema>
