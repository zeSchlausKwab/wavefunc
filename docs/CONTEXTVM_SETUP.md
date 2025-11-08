# ContextVM Metadata Server Setup

## ✅ Implementation Complete

A ContextVM server has been implemented to extract radio stream metadata and search MusicBrainz via Nostr.

## Architecture

```
Frontend (Player) ←→ Nostr Relay ←→ ContextVM Server ←→ External APIs
                                            │
                                            ├─ Icecast/Shoutcast Metadata
                                            └─ MusicBrainz API
```

## Files Created

- **`contextvm/server.ts`** - Main ContextVM MCP server
- **`contextvm/tools/stream-metadata.ts`** - Icecast/Shoutcast metadata extraction
- **`contextvm/tools/musicbrainz.ts`** - MusicBrainz search integration
- **`src/lib/metadataClient.ts`** - Frontend client for calling tools
- **`contextvm/test-client.ts`** - Test script for the client
- **`contextvm/README.md`** - Tool documentation
- **`contextvm/CONFIGURATION.md`** - Configuration guide
- **`METADATA_STRATEGY.md`** - Complete strategy document

## Available Tools

### 1. `extract_stream_metadata`

Extracts "now playing" info from streams.

**Input:** `{ url: string }`  
**Output:** `{ title, artist, song, station, genre, bitrate }`

### 2. `search_artists`

Search for artists on MusicBrainz by name.

**Input:** `{ query: string, limit?: number }`  
**Output:** Array of artist results with `{ id, type: 'artist', name, sortName, country, beginDate, endDate, type_, disambiguation, score, tags }`

### 3. `search_releases`

Search for releases (albums) on MusicBrainz.

**Input:** `{ query: string, artist?: string, limit?: number }`  
**Output:** Array of release results with `{ id, type: 'release', title, artist, artistId, date, country, trackCount, status, barcode, score, tags }`

### 4. `search_recordings`

Search for recordings (songs/tracks) on MusicBrainz.

**Input:** `{ query: string, artist?: string, limit?: number }`  
**Output:** Array of recording results with `{ id, type: 'recording', title, artist, artistId, release, releaseDate, duration, score, tags }`

### Client-Side Composition

The client-side library provides both individual search functions and a legacy `searchMusicBrainz()` function that composes searches on the client. This allows flexibility in how searches are performed while keeping the server tools simple and reusable.

## Running

The server starts automatically with the dev script:

```bash
bun run dev
# Starts: relay → migrate → contextvm → frontend
```

Or manually:

```bash
bun run contextvm
```

## Configuration

The server uses default development keys. For production, set environment variables:

```bash
# Server
METADATA_SERVER_KEY=your_hex_private_key

# Client (frontend)
METADATA_SERVER_PUBKEY=server_public_key
METADATA_CLIENT_KEY=client_hex_private_key

# Relay
RELAY_URL=ws://localhost:3334
```

See `contextvm/CONFIGURATION.md` for more details.

## Next Steps

### Phase 1: Basic Integration (Now)

✅ Server implemented  
✅ Tools created  
✅ Client library ready  
⏳ Integrate into player store  
⏳ Add metadata polling  
⏳ Display in UI

### Phase 2: Enhancement

- Add caching layer (avoid repeated API calls)
- Implement rate limiting
- Add error recovery
- Store metadata in Nostr events

### Phase 3: Additional Tools

- Last.fm integration (album art, scrobbling)
- Spotify search (high-quality art)
- AcoustID fingerprinting
- Lyrics fetching

## Usage Example

```typescript
import {
  extractStreamMetadata,
  searchRecordings,
  searchArtists,
  searchMusicBrainz, // Legacy function for backward compatibility
} from "./lib/metadataClient";

// Example 1: Search for a specific recording
const recordings = await searchRecordings("Paranoid", "Black Sabbath");

// Example 2: Search for artists
const artists = await searchArtists("Led Zeppelin");

// Example 3: In your player store (legacy usage still works)
playStation: async (station, stream) => {
  // ... start playback ...

  // Poll for metadata every 10 seconds
  const pollMetadata = setInterval(async () => {
    const metadata = await extractStreamMetadata(stream.url);

    if (metadata.artist && metadata.song) {
      // Use specific search for better results
      const mbResults = await searchRecordings(metadata.song, metadata.artist);

      set({
        currentMetadata: {
          ...metadata,
          musicBrainz: mbResults[0],
        },
      });
    }
  }, 10000);

  set({ metadataInterval: pollMetadata });
};
```

## Technical Notes

### Type Issues

There are some type mismatches between MCP SDK 1.x and Zod 4.x. These are suppressed with `@ts-expect-error` comments but don't affect runtime functionality.

### Stream Types Supported

- **Icecast/Shoutcast**: Full metadata extraction
- **HLS (.m3u8)**: Limited (ID3 tags in segments)
- **Regular HTTP**: Station info only

### MusicBrainz Guidelines

- Rate limit: 1 request per second
- Include User-Agent with app name
- Cache results (24h+)
- Consider sponsorship for heavy usage

## Testing

Test the server:

```bash
# Terminal 1: Start relay
bun run relay

# Terminal 2: Start contextvm server
bun run contextvm

# Terminal 3: Run test client
bun run contextvm/test-client.ts
```

## References

- [ContextVM Documentation](https://docs.contextvm.org/)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Icecast Metadata Protocol](https://cast.readme.io/docs/icy)
