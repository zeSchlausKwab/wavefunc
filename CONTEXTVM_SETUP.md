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

### 2. `musicbrainz_search`

Searches MusicBrainz for track details.

**Input:** `{ artist?, track?, query? }`  
**Output:** Array of `{ id, title, artist, release, releaseDate, duration, score, tags }`

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
import { extractStreamMetadata, searchMusicBrainz } from "./lib/metadataClient";

// In your player store
playStation: async (station, stream) => {
  // ... start playback ...

  // Poll for metadata every 10 seconds
  const pollMetadata = setInterval(async () => {
    const metadata = await extractStreamMetadata(stream.url);

    if (metadata.artist && metadata.song) {
      const mbResults = await searchMusicBrainz({
        artist: metadata.artist,
        track: metadata.song,
      });

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
