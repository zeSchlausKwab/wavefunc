import { z } from "zod";
import { eventSchema } from "../nostr";

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

// Radio station event content schema
export const RadioEventContentSchema = z.object({
  name: z.string(),
  description: z.string(),
  website: z.string().url().optional(),
  streams: z.array(StreamSchema),
});

// Favorites list item schema
export const FavoriteItemSchema = z.object({
  event_id: z.string(),
  added_at: z.number(),
  name: z.string(),
  notes: z.string().optional(),
});

// Favorites list content schema
export const FavoritesEventContentSchema = z.object({
  name: z.string(),
  description: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  favorites: z.array(FavoriteItemSchema),
});
