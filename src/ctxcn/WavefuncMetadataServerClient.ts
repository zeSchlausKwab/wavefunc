import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  NostrClientTransport,
  type NostrTransportOptions,
  PrivateKeySigner,
  ApplesauceRelayPool,
} from "@contextvm/sdk";

export interface ExtractStreamMetadataInput {
  /**
   * The URL of the Icecast/Shoutcast stream
   */
  url: string;
}

export interface ExtractStreamMetadataOutput {
  result: {
    title?: string;
    artist?: string;
    song?: string;
    station?: string;
    genre?: string;
    bitrate?: string;
    description?: string;
    listeners?: number;
    method?: string;
    url?: string;
    source?: "ICY" | "HLS-ID3" | "PLAYLIST" | "JSON" | "HEADERS" | "STREAM" | "UNKNOWN";
    raw?: {
      [k: string]: unknown;
    };
    notes?: string;
    enriched?: {
      artist: string;
      title: string;
      album?: string;
      releaseDate?: string;
      duration?: number;
      mbid?: string;
      confidence: "high" | "medium" | "low" | "none";
      source: "musicbrainz" | "raw" | "none";
    };
  };
}

export interface SearchArtistsInput {
  /**
   * Artist name to search for
   */
  query: string;
  /**
   * Maximum number of results (default: 10)
   */
  limit: number;
}

export interface SearchArtistsOutput {
  result: {
    id: string;
    type: "artist";
    name: string;
    sortName: string;
    country?: string;
    beginDate?: string;
    endDate?: string;
    type_?: string;
    disambiguation?: string;
    score: number;
    tags?: string[];
  }[];
}

export interface SearchReleasesInput {
  /**
   * Release/album title to search for
   */
  query: string;
  /**
   * Filter by artist name
   */
  artist: string;
  /**
   * Maximum number of results (default: 10)
   */
  limit: number;
}

export interface SearchReleasesOutput {
  result: {
    id: string;
    type: "release";
    title: string;
    artist: string;
    artistId?: string;
    date?: string;
    country?: string;
    trackCount?: number;
    status?: string;
    barcode?: string;
    score: number;
    tags?: string[];
  }[];
}

export interface SearchRecordingsInput {
  /**
   * Recording/track title to search for
   */
  query: string;
  /**
   * Filter by artist name
   */
  artist: string;
  /**
   * Maximum number of results (default: 10)
   */
  limit: number;
}

export interface SearchRecordingsOutput {
  result: {
    id: string;
    type: "recording";
    title: string;
    artist: string;
    artistId?: string;
    release?: string;
    releaseDate?: string;
    duration?: number;
    score: number;
    tags?: string[];
  }[];
}

export interface SearchLabelsInput {
  /**
   * Label name to search for
   */
  query: string;
  /**
   * Maximum number of results (default: 10)
   */
  limit: number;
}

export interface SearchLabelsOutput {
  result: {
    id: string;
    type: "label";
    name: string;
    sortName: string;
    country?: string;
    type_?: string;
    labelCode?: string;
    disambiguation?: string;
    score: number;
    tags?: string[];
  }[];
}

export interface SearchRecordingsCombinedInput {
  /**
   * Recording/track title (use quotes for exact match, e.g., "young men dead")
   */
  recording: string;
  /**
   * Artist name (use quotes for exact match, e.g., "the black angels")
   */
  artist: string;
  /**
   * Release/album name (optional)
   */
  release: string;
  /**
   * International Standard Recording Code (optional)
   */
  isrc: string;
  /**
   * Country code, e.g., US, GB (optional)
   */
  country: string;
  /**
   * Release date in YYYY or YYYY-MM-DD format (optional)
   */
  date: string;
  /**
   * Duration in milliseconds (optional, searches with ±5 second tolerance)
   */
  duration: number;
  /**
   * Maximum number of results (default: 10)
   */
  limit: number;
}

export interface SearchRecordingsCombinedOutput {
  result: {
    id: string;
    type: "recording";
    title: string;
    artist: string;
    artistId?: string;
    release?: string;
    releaseDate?: string;
    duration?: number;
    score: number;
    tags?: string[];
  }[];
}

export type WavefuncMetadataServer = {
  ExtractStreamMetadata: (url: string) => Promise<ExtractStreamMetadataOutput>;
  SearchArtists: (query: string, limit: number) => Promise<SearchArtistsOutput>;
  SearchReleases: (query: string, artist: string, limit: number) => Promise<SearchReleasesOutput>;
  SearchRecordings: (query: string, artist: string, limit: number) => Promise<SearchRecordingsOutput>;
  SearchLabels: (query: string, limit: number) => Promise<SearchLabelsOutput>;
  SearchRecordingsCombined: (recording: string, artist: string, release: string, isrc: string, country: string, date: string, duration: number, limit: number) => Promise<SearchRecordingsCombinedOutput>;
};

export class WavefuncMetadataServerClient implements WavefuncMetadataServer {
  static readonly SERVER_PUBKEY = "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2";
  static readonly DEFAULT_RELAYS = ["wss://relay.contextvm.org"];
  private client: Client;
  private transport: Transport;

  constructor(
    options: Partial<NostrTransportOptions> & { privateKey?: string; relays?: string[] } = {}
  ) {
    this.client = new Client({
      name: "WavefuncMetadataServerClient",
      version: "1.0.0",
    });

    // Private key precedence: constructor options > config file
    const resolvedPrivateKey = options.privateKey ||
      "";

    const {
      privateKey: _,
      relays = WavefuncMetadataServerClient.DEFAULT_RELAYS,
      signer = new PrivateKeySigner(resolvedPrivateKey),
      relayHandler = new ApplesauceRelayPool(relays),
 			serverPubkey,
      ...rest
    } = options;

    this.transport = new NostrClientTransport({
      serverPubkey: serverPubkey || WavefuncMetadataServerClient.SERVER_PUBKEY,
      signer,
      relayHandler,
      isStateless: true,
      ...rest,
    });

    // Auto-connect in constructor
    this.client.connect(this.transport).catch((error) => {
      console.error(`Failed to connect to server: ${error}`);
    });
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  private async call<T = unknown>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const result = await this.client.callTool({
      name,
      arguments: { ...args },
    });
    return result.structuredContent as T;
  }

    /**
   * Extracts 'now playing' metadata from Icecast/Shoutcast radio streams
   * @param {string} url The URL of the Icecast/Shoutcast stream
   * @returns {Promise<ExtractStreamMetadataOutput>} The result of the extract_stream_metadata operation
   */
  async ExtractStreamMetadata(
    url: string
  ): Promise<ExtractStreamMetadataOutput> {
    return this.call("extract_stream_metadata", { url });
  }

    /**
   * Search for artists on MusicBrainz by name. Returns artist details including country, dates, disambiguation, and tags.
   * @param {string} query Artist name to search for
   * @param {number} limit Maximum number of results (default: 10)
   * @returns {Promise<SearchArtistsOutput>} The result of the search_artists operation
   */
  async SearchArtists(
    query: string, limit: number
  ): Promise<SearchArtistsOutput> {
    return this.call("search_artists", { query, limit });
  }

    /**
   * Search for releases (albums) on MusicBrainz. Returns release details including artist, date, country, track count, and tags.
   * @param {string} query Release/album title to search for
   * @param {string} artist Filter by artist name
   * @param {number} limit Maximum number of results (default: 10)
   * @returns {Promise<SearchReleasesOutput>} The result of the search_releases operation
   */
  async SearchReleases(
    query: string, artist: string, limit: number
  ): Promise<SearchReleasesOutput> {
    return this.call("search_releases", { query, artist, limit });
  }

    /**
   * Search for recordings (songs/tracks) on MusicBrainz. Returns recording details including artist, release, duration, and tags.
   * @param {string} query Recording/track title to search for
   * @param {string} artist Filter by artist name
   * @param {number} limit Maximum number of results (default: 10)
   * @returns {Promise<SearchRecordingsOutput>} The result of the search_recordings operation
   */
  async SearchRecordings(
    query: string, artist: string, limit: number
  ): Promise<SearchRecordingsOutput> {
    return this.call("search_recordings", { query, artist, limit });
  }

    /**
   * Search for record labels on MusicBrainz. Returns label details including country, label code, type, and tags.
   * @param {string} query Label name to search for
   * @param {number} limit Maximum number of results (default: 10)
   * @returns {Promise<SearchLabelsOutput>} The result of the search_labels operation
   */
  async SearchLabels(
    query: string, limit: number
  ): Promise<SearchLabelsOutput> {
    return this.call("search_labels", { query, limit });
  }

    /**
   * Advanced combined search for recordings using multiple fields. Supports exact phrase matching (use quotes) and fuzzy search. Useful when you need precise results combining artist, recording title, release, ISRC, country, date, or duration. Example: recording='"young men dead"' artist='"the black angels"'
   * @param {string} recording Recording/track title (use quotes for exact match, e.g., "young men dead")
   * @param {string} artist Artist name (use quotes for exact match, e.g., "the black angels")
   * @param {string} release Release/album name (optional)
   * @param {string} isrc International Standard Recording Code (optional)
   * @param {string} country Country code, e.g., US, GB (optional)
   * @param {string} date Release date in YYYY or YYYY-MM-DD format (optional)
   * @param {number} duration Duration in milliseconds (optional, searches with ±5 second tolerance)
   * @param {number} limit Maximum number of results (default: 10)
   * @returns {Promise<SearchRecordingsCombinedOutput>} The result of the search_recordings_combined operation
   */
  async SearchRecordingsCombined(
    recording: string, artist: string, release: string, isrc: string, country: string, date: string, duration: number, limit: number
  ): Promise<SearchRecordingsCombinedOutput> {
    return this.call("search_recordings_combined", { recording, artist, release, isrc, country, date, duration, limit });
  }
}

/**
 * Default singleton instance of WavefuncMetadataServerClient.
 * This instance uses the default configuration and can be used directly
 * without creating a new instance.
 *
 * @example
 * import { wavefuncMetadataServer } from './WavefuncMetadataServerClient';
 * const result = await wavefuncMetadataServer.SomeMethod();
 */
export const wavefuncMetadataServer = new WavefuncMetadataServerClient();
