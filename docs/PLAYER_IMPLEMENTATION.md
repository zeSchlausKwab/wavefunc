# Player Implementation Summary

## ✅ Complete Feature Set

### Core Player Functionality

- **Zustand State Management**: Global player store for managing playback
- **Multi-Format Support**:
  - Regular HTTP streams (MP3, AAC, etc.)
  - HLS streams (.m3u8) via HLS.js
  - Icecast/Shoutcast streams with metadata
- **Playback Controls**: Play, pause, resume, stop
- **Volume Control**: Volume slider and mute toggle
- **Error Handling**: Comprehensive error states and user feedback

### UI Components

- **FloatingPlayer**: Persistent footer player with:
  - Station/track information display
  - Playback controls
  - Volume controls
  - Error messages
  - "Now playing" metadata (song, artist, album)
- **RadioCard**: Station cards with:
  - Play/pause buttons
  - Visual feedback for currently playing station
  - Station metadata display

### Metadata System (NEW! ✨)

- **ContextVM Server**: Nostr-based metadata service

  - Runs alongside relay
  - Modular tool-based architecture
  - Communicates via Nostr protocol

- **Two Metadata Tools**:

  1. **`extract_stream_metadata`**: Extracts "now playing" from streams

     - Icecast/Shoutcast header parsing
     - Stream data parsing for metadata intervals
     - Artist/title extraction

  2. **`musicbrainz_search`**: Enriches with MusicBrainz data
     - Album name and release date
     - Track duration
     - Genre tags
     - MusicBrainz ID for further lookups

- **Automatic Polling**:
  - Polls metadata every 15 seconds when playing
  - Displays in FloatingPlayer UI
  - Shows: Song → Artist → Album (Year)

## File Structure

```
src/
├── stores/
│   └── playerStore.ts          # Zustand player state + metadata polling
├── components/
│   ├── FloatingPlayer.tsx      # Footer player UI (with metadata display)
│   └── RadioCard.tsx           # Station cards with play buttons
├── lib/
│   ├── NDKStation.ts          # Station model with stream parsing
│   └── metadataClient.ts      # ContextVM client for metadata tools
└── App.tsx                    # Main app with player integration

contextvm/
├── server.ts                   # ContextVM MCP server
├── tools/
│   ├── stream-metadata.ts      # Icecast/Shoutcast metadata extraction
│   └── musicbrainz.ts          # MusicBrainz API integration
├── test-client.ts              # Test script for tools
├── README.md                   # Tool documentation
└── CONFIGURATION.md            # Setup guide

scripts/
└── migrate_legacy.ts           # SQL migration (fixed stream parsing)

package.json                    # Updated with contextvm scripts
```

## How It Works

### 1. User Clicks Play

```
RadioCard → playerStore.playStation(station) → Audio playback starts
```

### 2. Playback Process

```
playerStore.playStation()
  ├─> Validate stream exists
  ├─> Check if same station (resume if so)
  ├─> Clean up old HLS instance
  ├─> Detect stream type (HLS vs regular)
  ├─> Route to appropriate playback method:
  │     ├─> HLS.js (for .m3u8 on non-Safari)
  │     ├─> Native HLS (for .m3u8 on Safari)
  │     └─> Regular audio element
  └─> Start metadata polling
```

### 3. Metadata Polling (NEW!)

```
Every 15 seconds while playing:
  ├─> extractStreamMetadata(streamUrl) via ContextVM
  │     └─> ContextVM: HEAD request to stream
  │           └─> Parse Icecast headers (icy-title, icy-name, etc.)
  │                 └─> Extract "Artist - Song"
  │
  ├─> If artist + song found:
  │     └─> searchMusicBrainz(artist, track) via ContextVM
  │           └─> ContextVM: Query MusicBrainz API
  │                 └─> Return top result with album, date, tags
  │
  └─> Update playerStore.currentMetadata
        └─> FloatingPlayer rerenders with new info
```

### 4. UI Updates

```
FloatingPlayer subscribes to playerStore
  ├─> If currentMetadata.song exists:
  │     └─> Show: Song → Artist → Album (Year)
  └─> Otherwise:
        └─> Show: Station Name → Stream Format (Bitrate)
```

## Key Decisions

### Why Zustand?

- Lightweight (1KB gzipped)
- Simple API, no boilerplate
- Works great with React hooks
- Perfect for player state that needs to be accessed globally

### Why ContextVM + Nostr?

- **Decentralized**: No central metadata server required
- **Modular**: Tools can be added/removed independently
- **Scalable**: Can run multiple metadata servers
- **Privacy**: No direct frontend → external API calls
- **Flexible**: Works for both web and Tauri apps

### Why HLS.js?

- Native `<audio>` doesn't support HLS on most browsers
- HLS.js provides universal HLS support
- Handles adaptive bitrate streaming
- Widely used and well-maintained

### Why 15-second polling?

- Balance between freshness and API load
- Most radio stations update metadata every 3-5 minutes
- MusicBrainz rate limit is 1 req/sec (plenty of headroom)
- Could be increased to 30s if needed

## Development Workflow

### Start Everything

```bash
bun run dev
# Starts: relay → migration → contextvm → frontend
```

### Test Metadata Service

```bash
# Terminal 1
bun run relay

# Terminal 2
bun run contextvm

# Terminal 3
bun run contextvm/test-client.ts
```

## Next Steps

### Phase 1: Done ✅

- ✅ Basic player with Zustand
- ✅ HLS.js integration
- ✅ FloatingPlayer UI
- ✅ RadioCard play buttons
- ✅ ContextVM metadata server
- ✅ Stream metadata extraction
- ✅ MusicBrainz enrichment
- ✅ Metadata polling
- ✅ UI display

### Phase 2: Enhancement

- Add caching layer (avoid repeated MusicBrainz lookups)
- Implement rate limiting in ContextVM
- Store metadata in Nostr events (for offline use)
- Add "history" of played tracks
- Display album art from MusicBrainz

### Phase 3: Additional Tools

- Last.fm integration (scrobbling, album art)
- Spotify search (high-quality art)
- AcoustID fingerprinting (for streams without metadata)
- Lyrics fetching (Genius, LyricWiki)

### Phase 4: Advanced Features

- Equalizer
- Crossfade between stations
- Recording/timeshift
- Favorites/playlists
- Sleep timer

## Testing the Metadata System

1. **Start the dev server**:

   ```bash
   bun run dev
   ```

2. **Click play on a station** with good metadata (e.g., "Antenne Bayern - Chillout")

3. **Watch the console** for:

   ```
   🎧 Extracting metadata from: http://...
   🔍 Searching MusicBrainz: Artist Name - Track Name
   ```

4. **Check the FloatingPlayer footer**:

   - Should show song name (bold)
   - Artist name below
   - Album and year if found

5. **Wait 15 seconds** and watch it update with the next song

## Troubleshooting

### Metadata not showing?

- Check console for errors
- Verify ContextVM server is running
- Test stream URL manually: `curl -H "Icy-MetaData: 1" -I <stream-url>`
- Some streams don't provide metadata

### MusicBrainz not returning results?

- Artist/song name might be misspelled in stream
- Try searching MusicBrainz directly
- Rate limit might be hit (wait 1 second between requests)

### Player not starting?

- Check browser console for audio errors
- Verify stream URL is valid
- Try a different stream format

## Documentation

- **`CONTEXTVM_SETUP.md`**: ContextVM server setup and configuration
- **`METADATA_STRATEGY.md`**: Detailed metadata extraction strategy
- **`contextvm/README.md`**: Tool API documentation
- **`TAURI_SETUP.md`**: Tauri mobile app setup

## References

- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [HLS.js](https://github.com/video-dev/hls.js/)
- [ContextVM](https://docs.contextvm.org/)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Icecast Metadata](https://cast.readme.io/docs/icy)
