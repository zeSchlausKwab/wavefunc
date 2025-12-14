import { z } from "zod";

// ============================================================================
// Raw Metadata Interfaces (for enrichment input)
// ============================================================================

export const rawMetadataSchema = z.object({
  artist: z.string().optional(),
  title: z.string().optional(),
  song: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export type RawMetadata = z.infer<typeof rawMetadataSchema>;

// ============================================================================
// Stream Metadata Interfaces
// ============================================================================

export const streamMetadataEnrichedSchema = z.object({
  artist: z.string(),
  title: z.string(),
  album: z.string().optional(),
  releaseDate: z.string().optional(),
  duration: z.number().optional(),
  mbid: z.string().optional(),
  confidence: z.enum(["high", "medium", "low", "none"]),
  source: z.enum(["musicbrainz", "raw", "none"]),
});

export type EnrichedMetadata = z.infer<typeof streamMetadataEnrichedSchema>;

export const streamMetadataSchema = z.object({
  title: z.string().optional(),
  artist: z.string().optional(),
  song: z.string().optional(),
  station: z.string().optional(),
  genre: z.string().optional(),
  bitrate: z.string().optional(),
  description: z.string().optional(),
  listeners: z.number().optional(),
  method: z.string().optional(),
  url: z.string().optional(),
  source: z
    .enum([
      "ICY",
      "HLS-ID3",
      "PLAYLIST",
      "JSON",
      "HEADERS",
      "STREAM",
      "UNKNOWN",
    ])
    .optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  enriched: streamMetadataEnrichedSchema.optional(),
});

export type StreamMetadataEnriched = z.infer<
  typeof streamMetadataEnrichedSchema
>;
export type StreamMetadata = z.infer<typeof streamMetadataSchema>;

// ============================================================================
// MusicBrainz Interfaces
// ============================================================================

export const musicBrainzArtistSchema = z.object({
  id: z.string(),
  type: z.literal("artist"),
  name: z.string(),
  sortName: z.string(),
  country: z.string().optional(),
  beginDate: z.string().optional(),
  endDate: z.string().optional(),
  type_: z.string().optional(),
  disambiguation: z.string().optional(),
  score: z.number(),
  tags: z.array(z.string()).optional(),
});

export const musicBrainzReleaseSchema = z.object({
  id: z.string(),
  type: z.literal("release"),
  title: z.string(),
  artist: z.string(),
  artistId: z.string().optional(),
  date: z.string().optional(),
  country: z.string().optional(),
  trackCount: z.number().optional(),
  status: z.string().optional(),
  barcode: z.string().optional(),
  score: z.number(),
  tags: z.array(z.string()).optional(),
});

export const musicBrainzRecordingSchema = z.object({
  id: z.string(),
  type: z.literal("recording"),
  title: z.string(),
  artist: z.string(),
  artistId: z.string().optional(),
  release: z.string().optional(),
  releaseDate: z.string().optional(),
  duration: z.number().optional(),
  score: z.number(),
  tags: z.array(z.string()).optional(),
});

export const musicBrainzLabelSchema = z.object({
  id: z.string(),
  type: z.literal("label"),
  name: z.string(),
  sortName: z.string(),
  country: z.string().optional(),
  type_: z.string().optional(),
  labelCode: z.string().optional(),
  disambiguation: z.string().optional(),
  score: z.number(),
  tags: z.array(z.string()).optional(),
});

export type MusicBrainzArtist = z.infer<typeof musicBrainzArtistSchema>;
export type MusicBrainzRelease = z.infer<typeof musicBrainzReleaseSchema>;
export type MusicBrainzRecording = z.infer<typeof musicBrainzRecordingSchema>;
export type MusicBrainzLabel = z.infer<typeof musicBrainzLabelSchema>;

export type MusicBrainzResult =
  | MusicBrainzArtist
  | MusicBrainzRelease
  | MusicBrainzRecording
  | MusicBrainzLabel;

// ============================================================================
// Extract Stream Metadata Tool
// ============================================================================

export const extractStreamMetadataInputSchema = {
  url: z.string().describe("The URL of the Icecast/Shoutcast stream"),
};

export const extractStreamMetadataOutputSchema = {
  result: streamMetadataSchema,
};

export type ExtractStreamMetadataInput = {
  url: string;
};

export type ExtractStreamMetadataOutput = {
  result: StreamMetadata;
};

// ============================================================================
// Search Artists Tool
// ============================================================================

export const searchArtistsInputSchema = {
  query: z.string().describe("Artist name to search for"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export const searchArtistsOutputSchema = {
  result: z.array(musicBrainzArtistSchema),
};

export type SearchArtistsInput = {
  query: string;
  limit?: number;
};

export type SearchArtistsOutput = {
  result: MusicBrainzArtist[];
};

// ============================================================================
// Search Releases Tool
// ============================================================================

export const searchReleasesInputSchema = {
  query: z.string().describe("Release/album title to search for"),
  artist: z.string().optional().describe("Filter by artist name"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export const searchReleasesOutputSchema = {
  result: z.array(musicBrainzReleaseSchema),
};

export type SearchReleasesInput = {
  query: string;
  artist?: string;
  limit?: number;
};

export type SearchReleasesOutput = {
  result: MusicBrainzRelease[];
};

// ============================================================================
// Search Recordings Tool
// ============================================================================

export const searchRecordingsInputSchema = {
  query: z.string().describe("Recording/track title to search for"),
  artist: z.string().optional().describe("Filter by artist name"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export const searchRecordingsOutputSchema = {
  result: z.array(musicBrainzRecordingSchema),
};

export type SearchRecordingsInput = {
  query: string;
  artist?: string;
  limit?: number;
};

export type SearchRecordingsOutput = {
  result: MusicBrainzRecording[];
};

// ============================================================================
// Search Labels Tool
// ============================================================================

export const searchLabelsInputSchema = {
  query: z.string().describe("Label name to search for"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export const searchLabelsOutputSchema = {
  result: z.array(musicBrainzLabelSchema),
};

export type SearchLabelsInput = {
  query: string;
  limit?: number;
};

export type SearchLabelsOutput = {
  result: MusicBrainzLabel[];
};

// ============================================================================
// Search Recordings Combined Tool
// ============================================================================

export const searchRecordingsCombinedInputSchema = {
  recording: z
    .string()
    .optional()
    .describe(
      'Recording/track title (use quotes for exact match, e.g., "young men dead")'
    ),
  artist: z
    .string()
    .optional()
    .describe(
      'Artist name (use quotes for exact match, e.g., "the black angels")'
    ),
  release: z.string().optional().describe("Release/album name (optional)"),
  isrc: z
    .string()
    .optional()
    .describe("International Standard Recording Code (optional)"),
  country: z.string().optional().describe("Country code, e.g., US, GB (optional)"),
  date: z
    .string()
    .optional()
    .describe("Release date in YYYY or YYYY-MM-DD format (optional)"),
  duration: z
    .number()
    .optional()
    .describe("Duration in milliseconds (optional, searches with ±5 second tolerance)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export const searchRecordingsCombinedOutputSchema = {
  result: z.array(musicBrainzRecordingSchema),
};

export type SearchRecordingsCombinedInput = {
  recording?: string;
  artist?: string;
  release?: string;
  isrc?: string;
  country?: string;
  date?: string;
  duration?: number;
  limit?: number;
};

export type SearchRecordingsCombinedOutput = {
  result: MusicBrainzRecording[];
};
