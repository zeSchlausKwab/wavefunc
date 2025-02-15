import { z } from 'zod'
import { eventSchema } from '../nostr'

// Kind 30311: Radio Station (Parameterized Replaceable Event)
export const radioStationSchema = eventSchema.extend({
  kind: z.literal(30311),
  tags: z.object({
    d: z.string().min(1), // Unique identifier
    name: z.string().min(1),
    image: z.string().url().optional(),
    streams: z.array(z.string().url()),
    streams_qualities: z.array(z.string()).optional(),
    genre: z.array(z.string()).optional(),
    language: z.string().optional(),
  }),
})

// Kind 30312: Stream Metadata
export const streamMetadataSchema = eventSchema.extend({
  kind: z.literal(30312),
  tags: z.object({
    e: z.string().min(1), // Reference to station event
    type: z.enum(['icecast', 'hls', 'webrtc']),
    url: z.string().url(),
    codec: z.string().min(1),
    bitrate: z.string().regex(/^\d+kbps$/),
  }),
})

// Kind 31922: Now Playing Track
export const nowPlayingSchema = eventSchema.extend({
  kind: z.literal(31922),
  tags: z.object({
    e: z.string().min(1), // Reference to station event
    title: z.string().min(1),
    artist: z.string().min(1),
    album: z.string().optional(),
    duration: z.string().transform(Number).pipe(z.number().positive()),
    artwork: z.string().url().optional(),
    timestamp: z.string().datetime(),
  }),
})

export type RadioEventSchemas = typeof radioStationSchema | typeof streamMetadataSchema | typeof nowPlayingSchema
