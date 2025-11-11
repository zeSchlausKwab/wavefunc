import { z } from "zod";

// ============================================================================
// Extract Stream Metadata Tool
// ============================================================================

export const extractStreamMetadataSchema = {
  url: z.string().describe("The URL of the Icecast/Shoutcast stream"),
};

export type ExtractStreamMetadataInput = {
  url: string;
};

// ============================================================================
// Search Artists Tool
// ============================================================================

export const searchArtistsSchema = {
  query: z.string().describe("Artist name to search for"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export type SearchArtistsInput = {
  query: string;
  limit?: number;
};

// ============================================================================
// Search Releases Tool
// ============================================================================

export const searchReleasesSchema = {
  query: z.string().describe("Release/album title to search for"),
  artist: z.string().optional().describe("Filter by artist name"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export type SearchReleasesInput = {
  query: string;
  artist?: string;
  limit?: number;
};

// ============================================================================
// Search Recordings Tool
// ============================================================================

export const searchRecordingsSchema = {
  query: z.string().describe("Recording/track title to search for"),
  artist: z.string().optional().describe("Filter by artist name"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export type SearchRecordingsInput = {
  query: string;
  artist?: string;
  limit?: number;
};

// ============================================================================
// Search Labels Tool
// ============================================================================

export const searchLabelsSchema = {
  query: z.string().describe("Label name to search for"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results (default: 10)"),
};

export type SearchLabelsInput = {
  query: string;
  limit?: number;
};