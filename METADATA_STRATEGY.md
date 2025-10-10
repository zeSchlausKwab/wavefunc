# Metadata Strategy for Radio Streams

## Overview

WaveFunc uses a **ContextVM server** that communicates via Nostr to extract metadata from radio streams and enrich it with MusicBrainz data.

## Architecture

```
┌─────────────────┐          Nostr          ┌──────────────────────┐
│                 │ ◄──────────────────────► │  ContextVM Server    │
│  Frontend       │      (tool calls)        │                      │
│  (Player)       │                          │  • Stream Metadata   │
│                 │                          │  • MusicBrainz       │
└─────────────────┘                          └──────────────────────┘
        │                                              │
        │                                              │
        ▼                                              ▼
┌─────────────────┐                          ┌──────────────────────┐
│  Radio Stream   │                          │  External APIs       │
│  (HTTP/HLS)     │                          │  • MusicBrainz       │
└─────────────────┘                          │  • Icecast Metadata  │
                                             └──────────────────────┘
```

## Stream Types Encountered

Based on your radio database, you're dealing with:

### 1. **Icecast/Shoutcast Streams** (most common)

- **URL Pattern**: `http://stream.example.com:port/path`
- **Metadata**: Icecast headers (`icy-title`, `icy-name`)
- **Format**: MP3, AAC, OGG
- **Example**: `http://s5-webradio.antenne.de/chillout`

### 2. **HLS Streams** (`.m3u8`)

- **URL Pattern**: `https://example.com/path/stream.m3u8`
- **Metadata**: ID3 tags in transport stream segments
- **Format**: AAC, MP3 (in TS containers)
- **Example**: `https://unlimited5-us.dps.live/beethovenfm/gotardis/audio/now/livestream1.m3u8`

### 3. **Regular HTTP Streams**

- **URL Pattern**: Direct audio file URLs or simple streams
- **Metadata**: Limited or none
- **Format**: Various

## Metadata Extraction Strategy

### Phase 1: Stream-Level Metadata (Implemented)

**Tool:** `extract_stream_metadata`

1. **Icecast/Shoutcast Detection**

   - Send HTTP HEAD request with `Icy-MetaData: 1` header
   - Parse response headers:
     - `icy-title` / `icy-name`: Current song
     - `icy-genre`: Station genre
     - `icy-br`: Bitrate
   - Parse "Artist - Title" format from metadata

2. **HLS Stream Handling**

   - For `.m3u8` URLs: Parse master playlist
   - Fetch media segments and extract ID3 tags
   - Look for `TXXX` (custom text), `TIT2` (title), `TPE1` (artist)

3. **Fallback**
   - If no metadata: Return station name and "Unknown"

### Phase 2: Music Enrichment (Implemented)

**Tool:** `musicbrainz_search`

Once you have artist + title from Phase 1:

1. **Query MusicBrainz**

   - Search for recording by artist + track
   - Get top 5 results with scores

2. **Enrich Metadata**

   - Album name and release date
   - Track duration
   - Tags (genre, mood)
   - MBID (for further lookups)

3. **Cache Results**
   - Store in local state or database
   - Avoid repeated lookups for same track

### Phase 3: Additional Services (Future)

**Potential Tools:**

- `lastfm_search`: Album art, play count, similar tracks
- `spotify_search`: High-quality album art, popularity
- `acoustid_fingerprint`: Audio fingerprinting for ID

## Implementation in Player

### 1. Add Metadata Polling to Player Store

```typescript
// In playerStore.ts
playStation: (station, stream) => {
  // ... existing playback code ...

  // Start metadata polling
  set({ metadataInterval: setInterval(async () => {
    const metadata = await extractStreamMetadata(stream.url);

    if (metadata.artist && metadata.song) {
      // Enrich with MusicBrainz
      const mbResults = await searchMusicBrainz({
        artist: metadata.artist,
        track: metadata.song
      });

      set({
        currentMetadata: {
          ...metadata,
          musicBrainz: mbResults[0] // Top result
        }
      });
    }
  }, 10000) }); // Poll every 10 seconds
},

stop: () => {
  // ... existing stop code ...
  const { metadataInterval } = get();
  if (metadataInterval) clearInterval(metadataInterval);
}
```

### 2. Display in FloatingPlayer

```typescript
// In FloatingPlayer.tsx
{
  currentMetadata && (
    <div className="metadata">
      <p className="text-lg font-bold">
        {currentMetadata.song || currentMetadata.title}
      </p>
      <p className="text-sm text-gray-400">{currentMetadata.artist}</p>
      {currentMetadata.musicBrainz?.release && (
        <p className="text-xs text-gray-500">
          from {currentMetadata.musicBrainz.release}
        </p>
      )}
    </div>
  );
}
```

## Testing

### Start All Services

```bash
bun run dev
# This starts:
# 1. Relay (port 3334)
# 2. Migration script
# 3. ContextVM metadata server
# 4. Frontend dev server
```

### Manual Testing

**Test Stream Metadata:**

```bash
curl -H "Icy-MetaData: 1" -I http://s5-webradio.antenne.de/chillout
```

**Test MusicBrainz:**

```bash
curl "https://musicbrainz.org/ws/2/recording?query=artist:Radiohead+AND+recording:Creep&fmt=json"
```

### Frontend Testing

Open browser console and run:

```javascript
import { extractStreamMetadata, searchMusicBrainz } from "./lib/metadataClient";

// Test stream
const metadata = await extractStreamMetadata("http://stream.example.com");
console.log(metadata);

// Test MusicBrainz
const results = await searchMusicBrainz({
  artist: "Radiohead",
  track: "Creep",
});
console.log(results);
```

## Rate Limiting & Best Practices

### MusicBrainz Guidelines

- **Rate limit**: 1 request per second
- **User-Agent**: Include app name and contact
- **Caching**: Store results for 24h+
- **Consider sponsorship**: For heavy usage

### Implementation

```typescript
// Add to musicbrainz.ts
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second

async function rateLimitedFetch(url: string) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }

  lastRequestTime = Date.now();
  return fetch(url);
}
```

## Data Flow Example

```
1. User clicks play on "Radio BOB!"
   └─> playerStore.playStation()

2. Player starts streaming audio
   └─> Audio element begins playback

3. Player requests metadata (every 10s)
   └─> extractStreamMetadata("http://stream.url")
       └─> ContextVM server extracts Icecast headers
       └─> Returns: { title: "Foo Fighters - Everlong", ... }

4. Player enriches metadata
   └─> searchMusicBrainz({ artist: "Foo Fighters", track: "Everlong" })
       └─> ContextVM queries MusicBrainz API
       └─> Returns: [{ id: "mbid", release: "The Colour and the Shape", ... }]

5. Player updates UI
   └─> FloatingPlayer shows: "Everlong" by "Foo Fighters"
                             from "The Colour and the Shape (1997)"
```

## Benefits of This Design

✅ **Modular**: Each tool is independent and reusable  
✅ **Decentralized**: Uses Nostr for communication  
✅ **Scalable**: Easy to add new metadata sources  
✅ **Testable**: Tools can be tested in isolation  
✅ **Privacy**: No direct frontend → external API calls  
✅ **Efficient**: Server-side caching and rate limiting

## Next Steps

1. ✅ Implement ContextVM server
2. ✅ Create metadata extraction tool
3. ✅ Create MusicBrainz search tool
4. ⏳ Integrate client into player store
5. ⏳ Add metadata polling
6. ⏳ Display metadata in UI
7. ⏳ Add caching layer
8. ⏳ Implement rate limiting
9. ⏳ Add additional metadata sources (Last.fm, Spotify)
