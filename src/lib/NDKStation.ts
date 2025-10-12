import NDK, { NDKEvent, type NostrEvent } from "@nostr-dev-kit/ndk-hooks";
import { z } from "zod";

// Zod schemas for validation and type inference
const StreamQualitySchema = z.enum(["low", "medium", "high", "lossless"]);

const StreamSchema = z.object({
  url: z.url({ message: "Invalid stream URL" }),
  format: z.string().min(1, "Format is required"),
  quality: z.object({
    bitrate: z.number().nonnegative("Bitrate must be non-negative"), // Allow 0 for unknown bitrate
    codec: z.string().min(1, "Codec is required"),
    sampleRate: z.number().positive("Sample rate must be positive"),
  }),
  primary: z.boolean().optional(),
});

const StationContentSchema = z.object({
  description: z.string().min(1, "Description is required"),
  streams: z.array(StreamSchema).min(1, "At least one stream is required"),
  streamingServerUrl: z
    .url({ message: "Invalid streaming server URL" })
    .optional(),
});

const ClientTagSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  handlerReference: z.string().min(1, "Handler reference is required"),
  relayUrl: z.url({ message: "Invalid relay URL" }),
});

// Type definitions inferred from Zod schemas
export type StreamQuality = z.infer<typeof StreamQualitySchema>;
export type Stream = z.infer<typeof StreamSchema>;
export type StationContent = z.infer<typeof StationContentSchema>;
export type ClientTag = z.infer<typeof ClientTagSchema>;

/**
 * NDKStation - A comprehensive class for handling Radio Station Events (kind 31237)
 *
 * This class extends NDKEvent and provides methods for managing radio station data
 * according to the NostrRadio specification. It handles station metadata, streams,
 * tags, and provides validation and utility methods.
 */
export class NDKStation extends NDKEvent {
  static kinds = [31237]; // Radio Station Event kind

  static from(event: NDKEvent): NDKStation {
    return new NDKStation(event.ndk, event);
  }

  constructor(ndk: NDK | undefined, rawEvent?: NostrEvent | NDKEvent) {
    super(ndk, rawEvent);
    this.kind ??= 31237;
  }

  // Core Station Properties

  /**
   * Get the station's unique identifier (d-tag)
   */
  get stationId(): string | undefined {
    return this.tagValue("d");
  }

  /**
   * Set the station's unique identifier (d-tag)
   */
  set stationId(id: string | undefined) {
    if (id) {
      this.removeTag("d");
      this.tags.push(["d", id]);
    }
  }

  /**
   * Get the station name
   */
  get name(): string | undefined {
    return this.tagValue("name");
  }

  /**
   * Set the station name
   */
  set name(name: string | undefined) {
    if (name) {
      this.removeTag("name");
      this.tags.push(["name", name]);
    }
  }

  /**
   * Get the station description
   */
  get description(): string | undefined {
    return this.tagValue("description");
  }

  /**
   * Set the station description
   */
  set description(description: string | undefined) {
    if (description) {
      this.removeTag("description");
      this.tags.push(["description", description]);
    }
  }

  /**
   * Get the station thumbnail URL
   */
  get thumbnail(): string | undefined {
    return this.tagValue("thumbnail");
  }

  /**
   * Set the station thumbnail URL
   */
  set thumbnail(url: string | undefined) {
    if (url) {
      this.removeTag("thumbnail");
      this.tags.push(["thumbnail", url]);
    }
  }

  /**
   * Get the station website URL
   */
  get website(): string | undefined {
    return this.tagValue("website");
  }

  /**
   * Set the station website URL
   */
  set website(url: string | undefined) {
    if (url) {
      this.removeTag("website");
      this.tags.push(["website", url]);
    }
  }

  /**
   * Get the station location
   */
  get location(): string | undefined {
    return this.tagValue("location");
  }

  /**
   * Set the station location
   */
  set location(location: string | undefined) {
    if (location) {
      this.removeTag("location");
      this.tags.push(["location", location]);
    }
  }

  /**
   * Get the station country code
   */
  get countryCode(): string | undefined {
    return this.tagValue("country");
  }

  /**
   * Set the station country code
   */
  set countryCode(code: string | undefined) {
    if (code) {
      this.removeTag("country");
      this.tags.push(["country", code]);
    }
  }

  // Stream Management

  /**
   * Get all streams for the station
   */
  get streams(): Stream[] {
    // First try to get streams from tags
    const tagStreams = this.getMatchingTags("stream")
      .map((tag) => {
        // Only create stream if we have required fields
        if (!tag[1] || !tag[2] || !tag[3]) return null;

        try {
          // Parse quality from tag if it's a JSON string
          let quality;
          if (typeof tag[3] === "string") {
            try {
              quality = JSON.parse(tag[3]);
              // Validate that parsed quality has required properties
              if (
                !quality ||
                typeof quality.bitrate !== "number" ||
                typeof quality.codec !== "string" ||
                typeof quality.sampleRate !== "number"
              ) {
                return null;
              }
            } catch {
              return null;
            }
          } else {
            quality = tag[3];
          }

          const stream: Stream = {
            url: tag[1],
            format: tag[2],
            quality: quality,
            primary: tag.includes("primary"),
          };

          // Validate the stream before returning
          const validation = StreamSchema.safeParse(stream);
          return validation.success ? stream : null;
        } catch {
          return null;
        }
      })
      .filter((stream: Stream | null): stream is Stream => stream !== null);

    // If we found streams in tags, return them
    if (tagStreams.length > 0) {
      return tagStreams;
    }

    // Otherwise, try to parse streams from content field
    try {
      if (this.content) {
        const contentData = JSON.parse(this.content);
        if (contentData.streams && Array.isArray(contentData.streams)) {
          return contentData.streams
            .map((stream: any) => {
              try {
                const validation = StreamSchema.safeParse(stream);
                return validation.success ? stream : null;
              } catch {
                return null;
              }
            })
            .filter((stream: any): stream is Stream => stream !== null);
        }
      }
    } catch {
      // Content is not valid JSON or doesn't have streams
    }

    return [];
  }

  /**
   * Add a stream to the station with validation
   */
  addStream(stream: Stream): void {
    const validation = this.validateStream(stream);
    if (!validation.valid) {
      throw new Error(`Invalid stream: ${validation.errors.join(", ")}`);
    }

    const streamTag = [
      "stream",
      stream.url,
      stream.format,
      JSON.stringify(stream.quality),
    ];
    if (stream.primary) streamTag.push("primary");
    this.tags.push(streamTag);
  }

  /**
   * Add a stream and publish the updated station
   */
  async addStreamAndPublish(stream: Stream): Promise<void> {
    this.addStream(stream);

    // Invalidate cache before publishing
    if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
      await this.ndk.cacheAdapter.deleteEventIds([this.id]);
    }

    await this.sign();
    await this.publish();
  }

  /**
   * Remove a stream from the station
   */
  removeStream(url: string): boolean {
    const initialLength = this.tags.length;
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "stream" && tag[1] === url)
    );
    return this.tags.length !== initialLength;
  }

  /**
   * Remove a stream and publish the updated station
   */
  async removeStreamAndPublish(url: string): Promise<boolean> {
    const removed = this.removeStream(url);

    if (removed) {
      // Invalidate cache before publishing
      if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
        await this.ndk.cacheAdapter.deleteEventIds([this.id]);
      }

      await this.sign();
      await this.publish();
    }

    return removed;
  }

  /**
   * Update an existing stream
   */
  updateStream(url: string, updates: Partial<Stream>): boolean {
    const streams = this.streams;
    const streamIndex = streams.findIndex((stream) => stream.url === url);

    if (streamIndex === -1) return false;

    const existingStream = streams[streamIndex];
    if (!existingStream) return false;

    const updatedStream: Stream = {
      url: updates.url ?? existingStream.url,
      format: updates.format ?? existingStream.format,
      quality: updates.quality ?? existingStream.quality,
      primary: updates.primary ?? existingStream.primary,
    };

    const validation = this.validateStream(updatedStream);
    if (!validation.valid) {
      throw new Error(`Invalid stream update: ${validation.errors.join(", ")}`);
    }

    this.removeStream(url);
    this.addStream(updatedStream);
    return true;
  }

  /**
   * Update an existing stream and publish the updated station
   */
  async updateStreamAndPublish(
    url: string,
    updates: Partial<Stream>
  ): Promise<boolean> {
    const updated = this.updateStream(url, updates);

    if (updated) {
      // Invalidate cache before publishing
      if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
        await this.ndk.cacheAdapter.deleteEventIds([this.id]);
      }

      await this.sign();
      await this.publish();
    }

    return updated;
  }

  /**
   * Set all streams for the station (replaces existing)
   */
  setStreams(streams: Stream[]): void {
    // Validate all streams first
    streams.forEach((stream, index) => {
      const validation = this.validateStream(stream);
      if (!validation.valid) {
        throw new Error(
          `Invalid stream at index ${index}: ${validation.errors.join(", ")}`
        );
      }
    });

    this.removeTag("stream");
    streams.forEach((stream) => {
      const streamTag = [
        "stream",
        stream.url,
        stream.format,
        JSON.stringify(stream.quality),
      ];
      if (stream.primary) streamTag.push("primary");
      this.tags.push(streamTag);
    });
  }

  // Genre Management

  /**
   * Get all genres/categories for the station
   */
  get genres(): string[] {
    return this.getMatchingTags("c")
      .filter((tag) => tag[2] === "genre")
      .map((tag) => tag[1])
      .filter((genre): genre is string => genre !== undefined);
  }

  /**
   * Add a genre to the station
   */
  addGenre(genre: string): void {
    if (!this.genres.includes(genre)) {
      this.tags.push(["c", genre, "genre"]);
    }
  }

  /**
   * Remove a genre from the station
   */
  removeGenre(genre: string): void {
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "c" && tag[1] === genre && tag[2] === "genre")
    );
  }

  /**
   * Set all genres for the station (replaces existing)
   */
  setGenres(genres: string[]): void {
    // Remove existing genre tags
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "c" && tag[2] === "genre")
    );
    genres.forEach((genre) => this.addGenre(genre));
  }

  // Language Management

  /**
   * Get all languages for the station
   */
  get languages(): string[] {
    return this.getMatchingTags("l")
      .map((tag) => tag[1])
      .filter((lang): lang is string => lang !== undefined);
  }

  /**
   * Add a language to the station
   */
  addLanguage(language: string): void {
    if (!this.languages.includes(language)) {
      this.tags.push(["l", language]);
    }
  }

  /**
   * Remove a language from the station
   */
  removeLanguage(language: string): void {
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "l" && tag[1] === language)
    );
  }

  /**
   * Set all languages for the station (replaces existing)
   */
  setLanguages(languages: string[]): void {
    this.removeTag("l");
    languages.forEach((lang) => this.addLanguage(lang));
  }

  // Client Tag Management

  /**
   * Get the client information
   */
  get client(): ClientTag | undefined {
    const clientTag = this.getMatchingTags("client")[0];
    if (!clientTag || clientTag.length < 4) return undefined;

    const name = clientTag[1];
    const handlerReference = clientTag[2];
    const relayUrl = clientTag[3];

    if (!name || !handlerReference || !relayUrl) return undefined;

    return {
      name,
      handlerReference,
      relayUrl,
    };
  }

  /**
   * Set the client information
   */
  setClient(client: ClientTag): void {
    this.removeTag("client");
    this.tags.push([
      "client",
      client.name,
      client.handlerReference,
      client.relayUrl,
    ]);
  }

  // Validation and Utility Methods

  /**
   * Validate the station data using Zod schemas
   */
  validateStation(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.name) {
      errors.push("Station name is required");
    }

    if (this.streams.length === 0) {
      errors.push("At least one stream is required");
    }

    // Validate streams using Zod
    this.streams.forEach((stream, index) => {
      const validation = this.validateStream(stream);
      if (!validation.valid) {
        validation.errors.forEach((error) => {
          errors.push(`Stream ${index + 1}: ${error}`);
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate content using Zod schemas
   */
  validateContent(): { valid: boolean; errors: string[] } {
    try {
      const content = {
        description: this.description || "",
        streams: this.streams,
      };
      StationContentSchema.parse(content);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(
            (err) => `${err.path.join(".")}: ${err.message}`
          ),
        };
      }
      return { valid: false, errors: ["Unknown validation error"] };
    }
  }

  /**
   * Validate stream using Zod schema
   */
  validateStream(stream: Stream): { valid: boolean; errors: string[] } {
    try {
      StreamSchema.parse(stream);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(
            (err) => `${err.path.join(".")}: ${err.message}`
          ),
        };
      }
      return { valid: false, errors: ["Unknown validation error"] };
    }
  }

  /**
   * Validate client tag using Zod schema
   */
  validateClientTag(clientTag: ClientTag): {
    valid: boolean;
    errors: string[];
  } {
    try {
      ClientTagSchema.parse(clientTag);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(
            (err) => `${err.path.join(".")}: ${err.message}`
          ),
        };
      }
      return { valid: false, errors: ["Unknown validation error"] };
    }
  }

  /**
   * Check if the station is valid
   */
  override get isValid(): boolean {
    return this.validateStation().valid;
  }

  /**
   * Get the station's naddr (Nostr address) encoding
   */
  get naddr(): string {
    return this.encode();
  }

  /**
   * Get the station's address for referencing in other events
   */
  get address(): string {
    return `31237:${this.pubkey}:${this.stationId}`;
  }

  /**
   * Clone the station with optional modifications
   */
  clone(
    modifications?: Partial<{
      stationId: string;
      name: string;
      description: string;
      streams: Stream[];
      thumbnail: string;
      website: string;
      location: string;
      countryCode: string;
      genres: string[];
      languages: string[];
    }>
  ): NDKStation {
    const cloned = new NDKStation(this.ndk, this);

    if (modifications) {
      Object.entries(modifications).forEach(([key, value]) => {
        if (
          key === "genres" &&
          Array.isArray(value) &&
          value.every((v) => typeof v === "string")
        ) {
          cloned.setGenres(value as string[]);
        } else if (
          key === "languages" &&
          Array.isArray(value) &&
          value.every((v) => typeof v === "string")
        ) {
          cloned.setLanguages(value as string[]);
        } else if (
          key === "streams" &&
          Array.isArray(value) &&
          value.every((v) => typeof v === "object" && "url" in v)
        ) {
          cloned.setStreams(value as Stream[]);
        } else {
          (cloned as any)[key] = value;
        }
      });
    }

    return cloned;
  }
}

export default NDKStation;
