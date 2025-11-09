import NDK, { NDKEvent, type NostrEvent } from "@nostr-dev-kit/react";
import NDKReplaceableEvent from "./NDKReplaceableEvent";
import { z } from "zod";

// Zod schemas for validation and type inference
const FavoritesContentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  image: z.url("Invalid image URL").optional(),
  banner: z.url("Invalid banner URL").optional(),
});

// Type definitions inferred from Zod schemas
export type FavoritesContent = z.infer<typeof FavoritesContentSchema>;

/**
 * NDKWFFavorites - A comprehensive class for handling Favorites List Events (kind 30078)
 *
 * This class extends NDKEvent and provides methods for managing user favorite radio stations
 * according to the NostrRadio specification. It handles station references, metadata,
 * and provides validation and utility methods.
 */
export class NDKWFFavorites extends NDKReplaceableEvent {
  static kinds = [30078]; // Favorites List Event kind

  static from(event: NDKEvent): NDKWFFavorites {
    return new NDKWFFavorites(event.ndk, event);
  }

  constructor(ndk: NDK | undefined, rawEvent?: NostrEvent | NDKEvent) {
    super(ndk, rawEvent);
    this.kind ??= 30078;

    // Set default label for user favorites if not set
    if (!this.tagValue("l")) {
      this.tags.push(["l", "wavefunc_user_favourite_list"]);
    }
  }

  // Core Favorites Properties

  /**
   * Get the favorites list unique identifier (d-tag)
   */
  get favoritesId(): string | undefined {
    return this.tagValue("d");
  }

  /**
   * Set the favorites list unique identifier (d-tag)
   */
  set favoritesId(id: string | undefined) {
    if (id) {
      this.removeTag("d");
      this.tags.push(["d", id]);
    }
  }

  /**
   * Get the favorites list name
   */
  get name(): string | undefined {
    // Try tag first, then content
    return this.tagValue("name") || this.parsedContent?.name;
  }

  /**
   * Set the favorites list name
   */
  set name(name: string | undefined) {
    if (name) {
      this.removeTag("name");
      this.tags.push(["name", name]);

      // Also update content
      const content: any = this.parsedContent || {};
      content.name = name;
      this.content = JSON.stringify(content);
    }
  }

  /**
   * Get the favorites list description
   */
  get description(): string | undefined {
    // Try tag first, then content
    return this.tagValue("description") || this.parsedContent?.description;
  }

  /**
   * Set the favorites list description
   */
  set description(description: string | undefined) {
    if (description) {
      this.removeTag("description");
      this.tags.push(["description", description]);

      // Also update content
      const content: any = this.parsedContent || {};
      content.description = description;
      this.content = JSON.stringify(content);
    }
  }

  /**
   * Get the favorites list image URL
   */
  get image(): string | undefined {
    return this.parsedContent?.image;
  }

  /**
   * Set the favorites list image URL
   */
  set image(url: string | undefined) {
    const content: any = this.parsedContent || {};
    if (url) {
      content.image = url;
    } else {
      delete content.image;
    }
    this.content = JSON.stringify(content);
  }

  /**
   * Get the favorites list banner URL
   */
  get banner(): string | undefined {
    return this.parsedContent?.banner;
  }

  /**
   * Set the favorites list banner URL
   */
  set banner(url: string | undefined) {
    const content: any = this.parsedContent || {};
    if (url) {
      content.banner = url;
    } else {
      delete content.banner;
    }
    this.content = JSON.stringify(content);
  }

  /**
   * Get parsed content as object
   */
  private get parsedContent(): FavoritesContent | undefined {
    try {
      return this.content ? JSON.parse(this.content) : undefined;
    } catch {
      return undefined;
    }
  }

  // Station Management

  /**
   * Get all station references (addresses) in the favorites list
   */
  getStations(): string[] {
    return this.getMatchingTags("a")
      .map((tag) => tag[1])
      .filter((address): address is string => address !== undefined)
      .filter((address) => address.startsWith("31237:")); // Only radio station events
  }

  /**
   * Add a station to the favorites list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   * @param relay Optional relay URL where the station can be found
   */
  addStation(stationAddress: string, relay?: string): void {
    if (!stationAddress.startsWith("31237:")) {
      throw new Error(
        "Invalid station address format. Must start with '31237:'"
      );
    }

    // Check if station is already in favorites
    if (!this.hasStation(stationAddress)) {
      const aTag = ["a", stationAddress];
      if (relay) {
        aTag.push(relay);
      }
      this.tags.push(aTag);
    }
  }

  /**
   * Add a station and publish the updated list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   * @param relay Optional relay URL where the station can be found
   * @returns true if station was added, false if already exists
   */
  async addStationAndPublish(
    stationAddress: string,
    relay?: string
  ): Promise<boolean> {
    if (this.hasStation(stationAddress)) {
      return false; // Already in favorites
    }

    this.addStation(stationAddress, relay);

    // Update the created_at timestamp to ensure this is the newest version
    this.created_at = Math.floor(Date.now() / 1000);

    // Invalidate cache before publishing
    if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
      await this.ndk.cacheAdapter.deleteEventIds([this.id]);
    }

    // Also try to invalidate any cached version of this replaceable event
    if (this.ndk?.cacheAdapter && "query" in this.ndk.cacheAdapter) {
      try {
        const filter = {
          kinds: [30078],
          authors: [this.pubkey],
          "#d": [this.favoritesId].filter(Boolean),
        };
        const cachedEvents = await (this.ndk.cacheAdapter as any).query(filter);
        if (cachedEvents && cachedEvents.length > 0) {
          const cachedIds = cachedEvents.map((e: any) => e.id).filter(Boolean);
          if (cachedIds.length > 0 && this.ndk.cacheAdapter.deleteEventIds) {
            await this.ndk.cacheAdapter.deleteEventIds(cachedIds);
          }
        }
      } catch (e) {
        console.log("Cache invalidation attempt failed:", e);
      }
    }

    // Ensure NDK is connected
    if (!this.ndk?.pool || this.ndk.pool.connectedRelays().length === 0) {
      console.log("Connecting to relays...");
      await this.ndk?.connect();
      // Wait a bit for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await this.sign();

    // Debug the event before publishing (basic info only)
    console.log("🚀 Publishing favorites list:", {
      id: this.favoritesId,
      stationCount: this.getStationCount(),
      created_at: this.created_at,
    });

    const relays = await this.publish();

    console.log("✅ Published to", relays.size, "relays");

    if (relays.size === 0) {
      throw new Error(
        "Failed to publish to any relay. Check relay connection."
      );
    }

    return true;
  }

  /**
   * Remove a station from the favorites list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   */
  removeStation(stationAddress: string): boolean {
    const initialLength = this.tags.length;
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "a" && tag[1] === stationAddress)
    );
    return this.tags.length !== initialLength;
  }

  /**
   * Remove a station and publish the updated list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   * @returns true if station was removed, false if not found
   */
  async removeStationAndPublish(stationAddress: string): Promise<boolean> {
    const removed = this.removeStation(stationAddress);

    if (removed) {
      await this.prepareReplaceablePublish();
      await this.sign();
      await this.publish();
    }

    return removed;
  }

  /**
   * Check if a station is in the favorites list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   */
  hasStation(stationAddress: string): boolean {
    return this.getStations().includes(stationAddress);
  }

  /**
   * Toggle a station in the favorites list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   * @param relay Optional relay URL where the station can be found
   */
  toggleStation(stationAddress: string, relay?: string): boolean {
    if (this.hasStation(stationAddress)) {
      this.removeStation(stationAddress);
      return false; // Station was removed
    } else {
      this.addStation(stationAddress, relay);
      return true; // Station was added
    }
  }

  /**
   * Toggle a station and publish the updated list
   * @param stationAddress The address in format "31237:pubkey:d-tag"
   * @param relay Optional relay URL where the station can be found
   * @returns true if station was added, false if removed
   */
  async toggleStationAndPublish(
    stationAddress: string,
    relay?: string
  ): Promise<boolean> {
    const wasAdded = this.toggleStation(stationAddress, relay);

    // Invalidate cache before publishing
    if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
      await this.ndk.cacheAdapter.deleteEventIds([this.id]);
    }

    await this.sign();
    await this.publish();

    return wasAdded;
  }

  /**
   * Set all stations for the favorites list (replaces existing)
   * @param stationAddresses Array of station addresses
   */
  setStations(stationAddresses: string[]): void {
    // Validate all addresses first
    stationAddresses.forEach((address, index) => {
      if (!address.startsWith("31237:")) {
        throw new Error(
          `Invalid station address at index ${index}: Must start with '31237:'`
        );
      }
    });

    // Remove existing station references
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "a" && tag[1]?.startsWith("31237:"))
    );

    // Add new stations
    stationAddresses.forEach((address) => {
      this.addStation(address);
    });
  }

  /**
   * Clear all stations from the favorites list
   */
  clearStations(): void {
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "a" && tag[1]?.startsWith("31237:"))
    );
  }

  /**
   * Clear all stations and publish the updated list
   * @returns true if any stations were cleared
   */
  async clearStationsAndPublish(): Promise<boolean> {
    const hadStations = this.getStationCount() > 0;

    this.clearStations();

    if (hadStations) {
      // Update the created_at timestamp to ensure this is the newest version
      this.created_at = Math.floor(Date.now() / 1000);

      // Invalidate cache before publishing
      if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
        await this.ndk.cacheAdapter.deleteEventIds([this.id]);
      }

      await this.sign();
      await this.publish();
    }

    return hadStations;
  }

  /**
   * Get the number of stations in the favorites list
   */
  getStationCount(): number {
    return this.getStations().length;
  }

  // Utility Methods

  /**
   * Create a default favorites list for a user
   * @param ndk NDK instance
   * @param name Name of the favorites list
   * @param description Optional description
   */
  static createDefault(
    ndk: NDK,
    name: string = "My Favorite Stations",
    description?: string
  ): NDKWFFavorites {
    const favorites = new NDKWFFavorites(ndk);

    // Generate a unique identifier
    favorites.favoritesId = crypto.randomUUID();
    favorites.name = name;
    if (description) {
      favorites.description = description;
    }

    // Set content
    const content: FavoritesContent = { name };
    if (description) {
      content.description = description;
    }
    favorites.content = JSON.stringify(content);

    return favorites;
  }

  /**
   * Validate the favorites list data using Zod schemas
   */
  validateFavorites(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.name) {
      errors.push("Favorites list name is required");
    }

    if (!this.favoritesId) {
      errors.push("Favorites list identifier (d-tag) is required");
    }

    // Validate content structure
    const contentValidation = this.validateContent();
    if (!contentValidation.valid) {
      errors.push(...contentValidation.errors);
    }

    // Validate station addresses
    const stations = this.getStations();
    stations.forEach((address, index) => {
      if (!address.match(/^31237:[a-f0-9]{64}:.+$/)) {
        errors.push(
          `Invalid station address at position ${index + 1}: ${address}`
        );
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
      if (!this.content) {
        return { valid: false, errors: ["Content is required"] };
      }

      const parsedContent = JSON.parse(this.content);
      FavoritesContentSchema.parse(parsedContent);
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
      return { valid: false, errors: ["Invalid JSON content"] };
    }
  }

  /**
   * Check if the favorites list is valid
   */
  override get isValid(): boolean {
    return this.validateFavorites().valid;
  }

  /**
   * Get the favorites list naddr (Nostr address) encoding
   */
  get naddr(): string {
    return this.encode();
  }

  /**
   * Get the favorites list address for referencing in other events
   */
  get address(): string {
    return `30078:${this.pubkey}:${this.favoritesId}`;
  }

  /**
   * Clone the favorites list with optional modifications
   */
  clone(
    modifications?: Partial<{
      favoritesId: string;
      name: string;
      description: string;
      image: string;
      banner: string;
      stations: string[];
    }>
  ): NDKWFFavorites {
    const cloned = new NDKWFFavorites(this.ndk, this);

    if (modifications) {
      Object.entries(modifications).forEach(([key, value]) => {
        if (key === "stations" && Array.isArray(value)) {
          cloned.setStations(value as string[]);
        } else {
          (cloned as any)[key] = value;
        }
      });
    }

    return cloned;
  }

  /**
   * Get a summary of the favorites list
   */
  getSummary(): {
    id: string;
    name: string;
    description?: string;
    stationCount: number;
    createdAt: Date;
  } {
    return {
      id: this.favoritesId || "",
      name: this.name || "Untitled Favorites",
      description: this.description,
      stationCount: this.getStationCount(),
      createdAt: new Date(this.created_at! * 1000),
    };
  }

  /**
   * Delete this favorites list by publishing a deletion event (NIP-09)
   * This publishes a kind 5 event that requests deletion of this list
   */
  async deleteList(): Promise<void> {
    if (!this.ndk) {
      throw new Error("NDK instance is required to delete favorites list");
    }

    if (!this.id) {
      throw new Error("Cannot delete favorites list without event ID");
    }

    // Create a deletion event (kind 5)
    const deletionEvent = new NDKEvent(this.ndk);
    deletionEvent.kind = 5;
    deletionEvent.content = "Deleted favorites list";
    deletionEvent.tags = [
      ["e", this.id], // Reference to the event being deleted
      ["k", "30078"], // Kind of event being deleted
    ];

    // If this is a parameterized replaceable event, also include the coordinate
    if (this.favoritesId) {
      deletionEvent.tags.push([
        "a",
        `30078:${this.pubkey}:${this.favoritesId}`,
      ]);
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

export default NDKWFFavorites;
