import NDK, {
  NDKEvent,
  type NostrEvent,
  type ContentTaggingOptions,
  NDKKind,
} from "@nostr-dev-kit/react";
import { z } from "zod";

// Zod schemas for validation and type inference
const StreamQualitySchema = z.enum(["low", "medium", "high", "lossless"]);

const StreamSchema = z.object({
  url: z.url({ message: "Invalid stream URL" }),
  format: z.string().min(1, "Format is required"),
  quality: z.object({
    bitrate: z.number().nonnegative("Bitrate must be non-negative"),
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
  relayUrl: z.string().url({ message: "Invalid relay URL" }),
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
   * Parsed JSON content helper
   */
  private get parsedContent(): StationContent | undefined {
    try {
      return this.content
        ? (JSON.parse(this.content) as StationContent)
        : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Normalize potentially formatted URLs (trim spaces/backticks)
   */
  private normalizeUrl(url: string): string {
    return url.trim().replace(/^`|`$/g, "");
  }

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
    const tagStreams = this.getMatchingTags("stream")
      .map((tag) => {
        if (!tag[1] || !tag[2] || !tag[3]) return null;
        try {
          let quality;
          if (typeof tag[3] === "string") {
            try {
              quality = JSON.parse(tag[3]);
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
            url:
              typeof tag[1] === "string"
                ? this.normalizeUrl(tag[1])
                : (tag[1] as string),
            format: tag[2] as string,
            quality,
            primary: tag.includes("primary"),
          };

          const validation = StreamSchema.safeParse(stream);
          return validation.success ? stream : null;
        } catch {
          return null;
        }
      })
      .filter((s): s is Stream => s !== null);

    if (tagStreams.length > 0) return tagStreams;

    const pc = this.parsedContent;
    if (pc?.streams && pc.streams.length > 0) {
      const contentStreams = pc.streams
        .map((s) => {
          const stream: Stream = {
            url: this.normalizeUrl(s.url),
            format: s.format,
            quality: s.quality,
            primary: !!s.primary,
          };
          const validation = StreamSchema.safeParse(stream);
          return validation.success ? stream : null;
        })
        .filter((s): s is Stream => s !== null);
      return contentStreams;
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
   * Override react method to use both 'a' and 'e' tags for replaceable events
   * This ensures maximum compatibility with relays and proper referencing
   */
  override async react(content: string, publish = true): Promise<NDKEvent> {
    if (!this.ndk) throw new Error("No NDK instance found");
    this.ndk.assertSigner();

    console.log("Reacting to station:", this.address);

    const reaction = new NDKEvent(this.ndk, {
      kind: NDKKind.Reaction,
      content,
    });

    reaction.tags.push(["a", this.address]);
    reaction.tags.push(["e", this.id]);
    reaction.tags.push(["k", `${this.kind}`]);

    if (publish) await reaction.publish();

    return reaction;
  }

  /**
   * Override reply method to create proper NIP-22 comments for addressable events
   * Per NIP-22, comments on addressable events should use uppercase A, K, P tags
   *
   * @param forceNip22 - Force NIP-22 comment format (kind 1111)
   * @param opts - Content tagging options (unused, for signature compatibility)
   * @returns NDKEvent ready to have content set and be published
   */
  override reply(forceNip22 = false, opts?: ContentTaggingOptions): NDKEvent {
    if (!this.ndk) throw new Error("No NDK instance found");

    const replyEvent = new NDKEvent(this.ndk, {
      kind: forceNip22 ? 1111 : 1, // NIP-22 Generic Reply vs regular note
      content: "",
    } as NostrEvent);

    if (forceNip22) {
      // NIP-22: Use uppercase tags for root scope on addressable events
      // A tag: event address (kind:pubkey:d-tag)
      replyEvent.tags.push(["A", this.address]);

      // K tag: root event's kind
      replyEvent.tags.push(["K", `${this.kind}`]);

      // P tag: root event's pubkey
      replyEvent.tags.push(["P", this.pubkey]);

      // Also include 'e' tag for backwards compatibility with clients
      // that don't fully support NIP-22 addressable event references
      replyEvent.tags.push(["e", this.id]);
    } else {
      // Regular reply: use lowercase 'e' tag
      replyEvent.tags.push(["e", this.id, "", "root"]);
      replyEvent.tags.push(["p", this.pubkey]);
    }

    return replyEvent;
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

  /**
   * Delete this station by publishing a deletion event (NIP-09)
   * This publishes a kind 5 event that requests deletion of this station
   */
  async deleteStation(): Promise<void> {
    if (!this.ndk) {
      throw new Error("NDK instance is required to delete station");
    }

    if (!this.id) {
      throw new Error("Cannot delete station without event ID");
    }

    // Create a deletion event (kind 5)
    const deletionEvent = new NDKEvent(this.ndk);
    deletionEvent.kind = 5;
    deletionEvent.content = "Deleted radio station";
    deletionEvent.tags = [
      ["e", this.id], // Reference to the event being deleted
      ["k", "31237"], // Kind of event being deleted
    ];

    // If this is a parameterized replaceable event, also include the coordinate
    if (this.stationId) {
      deletionEvent.tags.push(["a", `31237:${this.pubkey}:${this.stationId}`]);
    }

    // Sign and publish deletion event
    await deletionEvent.sign();
    await deletionEvent.publish();

    // Clear from cache
    if (this.ndk.cacheAdapter?.deleteEventIds) {
      await this.ndk.cacheAdapter.deleteEventIds([this.id]);
    }
  }
}

export default NDKStation;
