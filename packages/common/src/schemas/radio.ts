import { z } from "zod";

// Stream quality schema
export const StreamQualitySchema = z.object({
  bitrate: z.number(),
  codec: z.string(),
  sampleRate: z.number(),
});

// Stream schema
export const StreamSchema = z.object({
  url: z.string().url(),
  format: z.string(),
  quality: StreamQualitySchema,
  primary: z.boolean().optional(),
});

// Updated Radio station event content schema - includes streams and markdown description
export const RadioEventContentSchema = z.object({
  streams: z.array(StreamSchema),
  description: z.string(),
});

// Radio station metadata schema (extracted from tags)
export const RadioMetadataSchema = z.object({
  name: z.string().optional(),
  website: z.string().url().optional(),
  location: z.string().optional(),
  countryCode: z.string().optional(),
  languageCodes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  thumbnail: z.string().url().optional(),
});

// Updated Favorites list content schema - no longer contains favorites array
export const FavoritesEventContentSchema = z.object({
  name: z.string(),
  description: z.string(),
});

// Schema for a favorite item extracted from an 'a' tag
export const FavoriteItemSchema = z.object({
  event_id: z.string(),
  name: z.string().optional(),
  added_at: z.number().optional(),
});
