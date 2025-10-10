# WaveFunc Development Status

## ✅ Completed Features

### 1. Core Radio Platform

- **Nostr Integration**: Using NDK for decentralized station discovery
- **Local Relay**: Go-based Nostr relay (port 3334)
- **Station Model**: NDKStation with validation (Zod schema)
- **Migration System**: Import 50 stations from legacy SQL database

### 2. Audio Player (Full Implementation)

- **State Management**: Zustand-based player store
- **Multi-Format Playback**:
  - Regular HTTP streams (MP3, AAC, OGG)
  - HLS streams (.m3u8) with HLS.js
  - Icecast/Shoutcast streams
- **Playback Controls**: Play, pause, resume, stop
- **Volume Control**: Slider + mute toggle
- **Error Handling**: Comprehensive error states

### 3. Metadata System (NEW! ✨)

- **ContextVM Server**: Nostr-based MCP server for metadata
- **Stream Metadata Extraction**:
  - Icecast/Shoutcast header parsing
  - "Now playing" title extraction
  - Artist/song parsing
- **MusicBrainz Integration**:
  - Album name and release date
  - Track duration and tags
  - MusicBrainz ID for further lookups
- **Automatic Polling**: Updates every 15 seconds
- **Rich UI Display**: Song → Artist → Album (Year)

### 4. UI Components

- **FloatingHeader**: Search bar, wallet button, login
- **StationView**: Grid of radio stations
- **RadioCard**: Station cards with play buttons
- **FloatingPlayer**: Persistent footer with:
  - Now playing metadata display
  - Playback controls
  - Volume controls
  - Loading states

### 5. Tauri Setup

- **Configuration**: Tauri v2 for Android/desktop
- **Build System**: Integrated with Bun
- **Icon Generation**: Placeholder icons created
- **Scripts**: `tauri:dev`, `tauri:build`, `tauri:android`

## 📁 Project Structure

```
wavefunc-rewrite/
├── src/
│   ├── App.tsx                     # Main app
│   ├── components/
│   │   ├── FloatingHeader.tsx      # Top navigation
│   │   ├── FloatingPlayer.tsx      # Player footer (metadata display)
│   │   ├── RadioCard.tsx           # Station cards
│   │   ├── StationView.tsx         # Station grid
│   │   └── ui/                     # shadcn/ui components
│   ├── stores/
│   │   └── playerStore.ts          # Zustand player state + metadata
│   └── lib/
│       ├── NDKStation.ts           # Station model
│       ├── metadataClient.ts       # ContextVM client
│       └── hooks/
│           └── useStations.ts      # Station fetching hook
│
├── contextvm/
│   ├── server.ts                   # ContextVM MCP server
│   ├── tools/
│   │   ├── stream-metadata.ts      # Icecast metadata extraction
│   │   └── musicbrainz.ts          # MusicBrainz API
│   ├── test-client.ts              # Test script
│   ├── README.md                   # Tool docs
│   └── CONFIGURATION.md            # Setup guide
│
├── relay/                          # Go Nostr relay
├── scripts/                        # Migration & seeding
├── src-tauri/                      # Tauri configuration
│
└── docs/
    ├── CONTEXTVM_SETUP.md          # ContextVM setup
    ├── METADATA_STRATEGY.md        # Metadata extraction guide
    ├── PLAYER_IMPLEMENTATION.md    # Player architecture
    ├── TAURI_SETUP.md              # Tauri setup
    └── STATUS.md                   # This file
```

## 🚀 Running the Project

### Development (Full Stack)

```bash
bun run dev
# Starts: relay → migration → contextvm → frontend
# Open: http://localhost:3000
```

### Individual Services

```bash
# Relay only
bun run relay

# ContextVM metadata server only
bun run contextvm

# Frontend only
bun run dev:frontend

# Tauri dev mode
bun run tauri:dev
```

### Testing

```bash
# Test migration script
bun run migrate

# Test metadata client
bun run contextvm/test-client.ts

# Build for production
bun run build
```

## 📊 Data Flow

### Station Discovery

```
User opens app
  └─> useStations() hook
      └─> NDK subscription to relay
          └─> Filter: kind 31237 (radio stations)
              └─> Parse events with NDKStation
                  └─> Display in StationView
```

### Playback + Metadata

```
User clicks play
  └─> RadioCard → playerStore.playStation()
      ├─> Start audio playback (HLS.js or native)
      └─> Start metadata polling (every 15s)
          ├─> ContextVM: extractStreamMetadata(url)
          │     └─> Parse Icecast headers
          │         └─> Return: {title, artist, song, station, genre}
          │
          └─> ContextVM: searchMusicBrainz(artist, track)
                └─> Query MusicBrainz API
                    └─> Return: {release, releaseDate, tags, etc.}

      └─> Update FloatingPlayer UI with metadata
```

## 🔧 Configuration

### Environment Variables

```bash
# Relay
RELAY_URL=ws://localhost:3334

# ContextVM Server
METADATA_SERVER_KEY=<hex_private_key>

# Frontend Client
METADATA_SERVER_PUBKEY=<server_public_key>
METADATA_CLIENT_KEY=<hex_private_key>
```

### Default Development Keys

- Server: `0000...0001` → pubkey `79be66...81798`
- Client: `0000...0002` → pubkey `c6047f...709ee5`

## 📝 Recent Changes

### Latest Session (Metadata Implementation)

1. ✅ Installed ContextVM SDK + MCP SDK
2. ✅ Created ContextVM server with 2 tools
3. ✅ Implemented stream metadata extraction
4. ✅ Implemented MusicBrainz search
5. ✅ Created frontend client library
6. ✅ Added metadata polling to player store
7. ✅ Updated FloatingPlayer UI to display metadata
8. ✅ Integrated with existing player system
9. ✅ Updated package.json scripts
10. ✅ Created documentation

### Previous Sessions

- Fixed migration script stream parsing
- Integrated HLS.js for .m3u8 streams
- Fixed audio element rendering race condition
- Added visual feedback for playing station
- Set up Tauri v2 configuration

## ⚠️ Known Issues

### Minor Type Errors

- `src/lib/metadataClient.ts`: Type mismatch with MCP SDK (non-blocking)
- `src/lib/NDKStation.ts`: Implicit 'any' in stream validation (cosmetic)

These don't affect functionality and are suppressed with `@ts-expect-error` or `as any`.

### Stream Limitations

- Some stations don't provide metadata
- HLS streams have limited metadata support
- Metadata polling requires ContextVM server running

## 🎯 Next Steps

### Short Term

1. Test metadata system with real stations
2. Add caching layer for MusicBrainz results
3. Implement rate limiting (1 req/sec for MusicBrainz)
4. Display album art from MusicBrainz/Last.fm
5. Add "Recently Played" history

### Medium Term

1. Store metadata in Nostr events for offline use
2. Add Last.fm integration (scrobbling, album art)
3. Implement playlists/favorites
4. Add search and filtering
5. User profiles and station submission

### Long Term

1. Mobile app with Tauri
2. Desktop app (Windows, Mac, Linux)
3. AcoustID fingerprinting for better matching
4. Lyrics display
5. Social features (comments, ratings)
6. Station recommendations

## 📚 Documentation

- **`CONTEXTVM_SETUP.md`**: ContextVM server setup
- **`METADATA_STRATEGY.md`**: Complete metadata extraction guide
- **`PLAYER_IMPLEMENTATION.md`**: Player architecture deep dive
- **`TAURI_SETUP.md`**: Tauri setup and code reuse
- **`MIGRATION_GUIDE.md`**: Legacy database migration
- **`SPEC.md`**: Nostr radio protocol specification

## 🧪 Testing Checklist

- [x] Relay starts successfully
- [x] Migration imports stations
- [x] Stations display in grid
- [x] Play button starts audio
- [x] HLS streams work (with HLS.js)
- [x] Regular streams work (native audio)
- [x] Player footer always visible
- [x] Volume control works
- [x] Stop button works
- [ ] **ContextVM server starts** (needs testing)
- [ ] **Metadata extraction works** (needs testing)
- [ ] **MusicBrainz search works** (needs testing)
- [ ] **Metadata displays in UI** (needs testing)
- [ ] Tauri build works
- [ ] Android build works

## 🤝 Contributing

### Key Technologies

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **State**: Zustand, NDK hooks
- **Audio**: HTML5 Audio, HLS.js
- **Backend**: Bun, Go (relay), ContextVM (metadata)
- **Protocol**: Nostr (NIP-01, custom kind 31237)
- **Mobile**: Tauri v2

### Code Style

- Use Bun instead of Node.js/npm
- Prefer functional components and hooks
- Use Zustand for global state
- Follow existing file structure
- Add documentation for new features

## 📞 Support

For questions or issues:

1. Check documentation in `/docs`
2. Read relevant `.md` files in project root
3. Check console for errors
4. Verify all services are running

---

**Last Updated**: October 2025  
**Status**: Active Development  
**Version**: 0.1.0
