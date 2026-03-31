import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  NostrClientTransport,
  type NostrTransportOptions,
  PrivateKeySigner,
  ApplesauceRelayPool,
} from "@contextvm/sdk";
import { config } from "../config/env";

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
  limit?: number;
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
  artist?: string;
  /**
   * Maximum number of results (default: 10)
   */
  limit?: number;
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
  artist?: string;
  /**
   * Maximum number of results (default: 10)
   */
  limit?: number;
}

export interface SearchRecordingsOutput {
  result: {
    id: string;
    type: "recording";
    title: string;
    artist: string;
    artistId?: string;
    release?: string;
    releaseId?: string;
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
  limit?: number;
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
  recording?: string;
  /**
   * Artist name (use quotes for exact match, e.g., "the black angels")
   */
  artist?: string;
  /**
   * Release/album name (optional)
   */
  release?: string;
  /**
   * International Standard Recording Code (optional)
   */
  isrc?: string;
  /**
   * Country code, e.g., US, GB (optional)
   */
  country?: string;
  /**
   * Release date in YYYY or YYYY-MM-DD format (optional)
   */
  date?: string;
  /**
   * Duration in milliseconds (optional, searches with ±5 second tolerance)
   */
  duration?: number;
  /**
   * Maximum number of results (default: 10)
   */
  limit?: number;
}

export interface SearchRecordingsCombinedOutput {
  result: {
    id: string;
    type: "recording";
    title: string;
    artist: string;
    artistId?: string;
    release?: string;
    releaseId?: string;
    releaseDate?: string;
    duration?: number;
    score: number;
    tags?: string[];
  }[];
}

export interface SearchYouTubeInput {
  query: string;
  limit?: number;
}

export interface YouTubeResult {
  videoId: string;
  url: string;
  title: string;
  duration?: number;
  channel?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  uploadDate?: string;
}

export interface SearchYouTubeOutput {
  results: YouTubeResult[];
}

export type DownloadFormat = "audio" | "360p" | "480p" | "720p";

export interface PrepareDownloadInput {
  videoId: string;
  format?: DownloadFormat;
}

export interface PrepareDownloadOutput {
  tempId: string;
  sha256: string;
  size: number;
  mimeType: string;
}

export interface UploadToBlossomInput {
  tempId: string;
  blossomUrl: string;
  signedAuthEvent: string;
}

export interface DownloadAudioOutput {
  url: string;
  sha256: string;
  size: number;
  mimeType: string;
}

export type WavefuncMetadataServer = {
  ExtractStreamMetadata: (url: string) => Promise<ExtractStreamMetadataOutput>;
  SearchArtists: (query: string, limit?: number) => Promise<SearchArtistsOutput>;
  SearchReleases: (query: string, artist?: string, limit?: number) => Promise<SearchReleasesOutput>;
  SearchRecordings: (query: string, artist?: string, limit?: number) => Promise<SearchRecordingsOutput>;
  SearchLabels: (query: string, limit?: number) => Promise<SearchLabelsOutput>;
  SearchRecordingsCombined: (recording?: string, artist?: string, release?: string, isrc?: string, country?: string, date?: string, duration?: number, limit?: number) => Promise<SearchRecordingsCombinedOutput>;
  SearchYouTube: (query: string, limit?: number) => Promise<SearchYouTubeOutput>;
  PrepareDownload: (videoId: string, format?: DownloadFormat, onprogress?: (p: { progress: number; message?: string }) => void) => Promise<PrepareDownloadOutput>;
  UploadToBlossom: (tempId: string, blossomUrl: string, signedAuthEvent: string, onprogress?: (p: { progress: number; message?: string }) => void) => Promise<DownloadAudioOutput>;
};

export class WavefuncMetadataServerClient implements WavefuncMetadataServer {
  static readonly SERVER_PUBKEY = "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2";
  static readonly DEFAULT_RELAYS = ["ws://localhost:3334"];
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

    // Use options.signer if provided, otherwise create from resolved private key
    const signer = options.signer || new PrivateKeySigner(resolvedPrivateKey);
    // Use options.relays if provided, otherwise use class DEFAULT_RELAYS
    const relays = options.relays || WavefuncMetadataServerClient.DEFAULT_RELAYS;
    // Use options.relayHandler if provided, otherwise create from relays
    const relayHandler = options.relayHandler || new ApplesauceRelayPool(relays);
    const serverPubkey = options.serverPubkey;
    const { privateKey: _, ...rest } = options;

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
    args: Record<string, unknown>,
    options?: { timeout?: number; onprogress?: (progress: { progress: number; message?: string }) => void }
  ): Promise<T> {
    const result = await this.client.callTool(
      { name, arguments: { ...args } },
      undefined,
      options ? { timeout: options.timeout, resetTimeoutOnProgress: true, onprogress: options.onprogress } : undefined
    );
    if (result.isError) {
      // Server returns { error: "..." } in content[0].text when isError: true
      let msg = `Tool "${name}" failed`;
      try {
        const parsed = JSON.parse((result.content?.[0] as any)?.text ?? "{}");
        if (parsed.error) msg = parsed.error;
      } catch { /* ignore parse errors */ }
      throw new Error(msg);
    }
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
   * @param {number} limit [optional] Maximum number of results (default: 10)
   * @returns {Promise<SearchArtistsOutput>} The result of the search_artists operation
   */
  async SearchArtists(
    query: string, limit?: number
  ): Promise<SearchArtistsOutput> {
    return this.call("search_artists", { query, limit });
  }

    /**
   * Search for releases (albums) on MusicBrainz. Returns release details including artist, date, country, track count, and tags.
   * @param {string} query Release/album title to search for
   * @param {string} artist [optional] Filter by artist name
   * @param {number} limit [optional] Maximum number of results (default: 10)
   * @returns {Promise<SearchReleasesOutput>} The result of the search_releases operation
   */
  async SearchReleases(
    query: string, artist?: string, limit?: number
  ): Promise<SearchReleasesOutput> {
    return this.call("search_releases", { query, artist, limit });
  }

    /**
   * Search for recordings (songs/tracks) on MusicBrainz. Returns recording details including artist, release, duration, and tags.
   * @param {string} query Recording/track title to search for
   * @param {string} artist [optional] Filter by artist name
   * @param {number} limit [optional] Maximum number of results (default: 10)
   * @returns {Promise<SearchRecordingsOutput>} The result of the search_recordings operation
   */
  async SearchRecordings(
    query: string, artist?: string, limit?: number
  ): Promise<SearchRecordingsOutput> {
    return this.call("search_recordings", { query, artist, limit });
  }

    /**
   * Search for record labels on MusicBrainz. Returns label details including country, label code, type, and tags.
   * @param {string} query Label name to search for
   * @param {number} limit [optional] Maximum number of results (default: 10)
   * @returns {Promise<SearchLabelsOutput>} The result of the search_labels operation
   */
  async SearchLabels(
    query: string, limit?: number
  ): Promise<SearchLabelsOutput> {
    return this.call("search_labels", { query, limit });
  }

    /**
   * Advanced combined search for recordings using multiple fields. Supports exact phrase matching (use quotes) and fuzzy search. Useful when you need precise results combining artist, recording title, release, ISRC, country, date, or duration. Example: recording='"young men dead"' artist='"the black angels"'
   * @param {string} recording [optional] Recording/track title (use quotes for exact match, e.g., "young men dead")
   * @param {string} artist [optional] Artist name (use quotes for exact match, e.g., "the black angels")
   * @param {string} release [optional] Release/album name (optional)
   * @param {string} isrc [optional] International Standard Recording Code (optional)
   * @param {string} country [optional] Country code, e.g., US, GB (optional)
   * @param {string} date [optional] Release date in YYYY or YYYY-MM-DD format (optional)
   * @param {number} duration [optional] Duration in milliseconds (optional, searches with ±5 second tolerance)
   * @param {number} limit [optional] Maximum number of results (default: 10)
   * @returns {Promise<SearchRecordingsCombinedOutput>} The result of the search_recordings_combined operation
   */
  async SearchRecordingsCombined(
    recording?: string, artist?: string, release?: string, isrc?: string, country?: string, date?: string, duration?: number, limit?: number
  ): Promise<SearchRecordingsCombinedOutput> {
    return this.call("search_recordings_combined", { recording, artist, release, isrc, country, date, duration, limit });
  }

  /**
   * Search YouTube for videos matching a query. Uses yt-dlp's ytsearch feature.
   * @param {string} query Search query, e.g. "artist song title"
   * @param {number} limit [optional] Number of results (default: 5, max: 10)
   */
  async SearchYouTube(query: string, limit?: number): Promise<SearchYouTubeOutput> {
    return this.call("search_youtube", { query, limit });
  }

  /**
   * Download and prepare a media file server-side. Returns tempId + sha256
   * so the client can sign a BUD-01 auth event before uploading.
   * May take 30–120 seconds.
   */
  async PrepareDownload(
    videoId: string,
    format: DownloadFormat = "audio",
    onprogress?: (progress: { progress: number; message?: string }) => void
  ): Promise<PrepareDownloadOutput> {
    return this.call(
      "prepare_download",
      { videoId, format },
      { timeout: 10 * 60 * 1000, onprogress }
    );
  }

  /**
   * Upload a previously prepared file to a Blossom server using a client-signed
   * BUD-01 kind 24242 auth event.
   */
  async UploadToBlossom(
    tempId: string,
    blossomUrl: string,
    signedAuthEvent: string,
    onprogress?: (progress: { progress: number; message?: string }) => void
  ): Promise<DownloadAudioOutput> {
    return this.call(
      "upload_to_blossom",
      { tempId, blossomUrl, signedAuthEvent },
      { timeout: 5 * 60 * 1000, onprogress }
    );
  }
}

let _instance: WavefuncMetadataServerClient | null = null;

export function getMetadataClient(): WavefuncMetadataServerClient {
  if (!_instance) {
    _instance = new WavefuncMetadataServerClient({
      privateKey: config.metadataClientKey,
      relays: [config.relayUrl],
    });
  }
  return _instance;
}
