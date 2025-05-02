import { z } from 'zod'

export const StreamQualitySchema = z.object({
    bitrate: z.number().min(1),
    codec: z.string().min(1),
    sampleRate: z.number().min(1),
})

export const StreamSchema = z.object({
    url: z.string().url(),
    format: z.string().min(1),
    quality: StreamQualitySchema,
    primary: z.boolean().default(false),
})

const optionalUrl = z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.string().url('Must be a valid URL').optional(),
)

export const StationSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().min(1, 'Description is required'),
    website: optionalUrl,
    thumbnail: optionalUrl,
    countryCode: z.string().max(10).optional(),
    languageCodes: z.array(z.string()).default([]),
    streams: z.array(StreamSchema).min(1, 'At least one stream is required'),
    tags: z.array(z.string()).default([]),
    streamingServerUrl: optionalUrl,
})

export type StationFormData = z.infer<typeof StationSchema>
