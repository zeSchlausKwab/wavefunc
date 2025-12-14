# ContextVM Metadata Server

A Nostr-based MCP server for radio stream metadata extraction and MusicBrainz lookups.

## Architecture

The server exposes two modular tools via Nostr:

### 1. **extract_stream_metadata**

Extracts "now playing" information from Icecast/Shoutcast radio streams.

**Input:**

- `url`: Radio stream URL

**Output:**

```json
{
  "title": "Artist - Song Title",
  "artist": "Artist Name",
  "song": "Song Title",
  "station": "Station Name",
  "genre": "Rock",
  "bitrate": "128"
}
```

### 2. **musicbrainz_search**

Searches MusicBrainz for detailed track information.

**Input:**

- `artist`: Artist name (optional)
- `track`: Track title (optional)
- `query`: Free-form search query (optional)

**Output:**

```json
[
  {
    "id": "mbid-xxxx",
    "title": "Song Title",
    "artist": "Artist Name",
    "artistId": "artist-mbid",
    "release": "Album Name",
    "releaseDate": "2023-01-01",
    "duration": 240000,
    "score": 100,
    "tags": ["rock", "alternative"]
  }
]
```

## Running

The server starts automatically with `bun run dev` and announces itself to the relay.

**Manual start:**

```bash
bun run contextvm
```

**Environment variables:**

- `METADATA_SERVER_KEY`: Nostr private key for the server (hex format)
- `RELAY_URL`: Relay URL (default: ws://localhost:3334)

## Client Usage

From the frontend, use the ContextVM client to call tools:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client";
import { NostrClientTransport } from "@contextvm/sdk";

// Connect to server
const client = new Client({ name: "wavefunc", version: "1.0.0" });
await client.connect(transport);

// Extract stream metadata
const result = await client.callTool({
  name: "extract_stream_metadata",
  arguments: { url: "http://stream.example.com/radio" },
});

// Search MusicBrainz
const mbResults = await client.callTool({
  name: "musicbrainz_search",
  arguments: { artist: "Radiohead", track: "Creep" },
});
```

## Modular Design

Each tool is isolated in its own file:

- `tools/stream-metadata.ts` - Stream metadata extraction
- `tools/musicbrainz.ts` - MusicBrainz API integration

This makes it easy to:

- Add new tools (Last.fm, Spotify, etc.)
- Test tools independently
- Swap implementations
- Reuse tools in other projects

## References

- [ContextVM Documentation](https://docs.contextvm.org/ts-sdk/tutorials/client-server-communication/)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Model Context Protocol](https://modelcontextprotocol.io/)
