# WaveFunc Quick Start Guide

Get up and running with the full metadata-enhanced radio player in under 5 minutes.

## 🚀 Installation

```bash
# Clone and install
cd /Users/schlaus/workspace/wavefunc-rewrite
bun install
```

## ▶️ Start the Full Stack

One command starts everything:

```bash
bun run dev
```

This starts:

1. **Nostr Relay** (port 3334) - for decentralized station discovery
2. **Migration Script** - imports 50 radio stations from legacy database
3. **ContextVM Metadata Server** - extracts stream metadata and MusicBrainz data
4. **Frontend Dev Server** - React app with hot reload

Then open **http://localhost:3000** in your browser.

## 🎵 Try It Out

1. **Browse Stations**: Scroll through the grid of radio stations
2. **Click Play**: Click the play button on any station card
3. **Watch the Footer**: The player footer appears at the bottom
4. **See Metadata**: Within 15 seconds, you should see:
   - Song title (bold)
   - Artist name
   - Album and year (if found in MusicBrainz)

## 🛠️ Individual Services

Need to run services separately?

```bash
# Just the relay
bun run relay

# Just the metadata server
bun run contextvm

# Just the frontend
bun run dev:frontend

# Reset relay database
bun run relay:reset
```

## 📊 What's Happening Behind the Scenes?

### 1. Station Discovery

- Relay stores radio station events (Nostr kind 31237)
- Frontend subscribes to relay
- NDK parses events into `NDKStation` objects
- Stations display in grid

### 2. Audio Playback

- Click play → Zustand `playerStore.playStation()`
- Detect stream type (HLS vs regular)
- Use HLS.js for .m3u8 streams, native audio for others
- Display controls in `FloatingPlayer`

### 3. Metadata Extraction (NEW!)

- Every 15 seconds while playing:
  1. **ContextVM** → `extract_stream_metadata(streamUrl)`
     - Parse Icecast headers (`icy-title`, `icy-name`)
     - Extract "Artist - Song"
  2. **ContextVM** → `musicbrainz_search(artist, track)`
     - Query MusicBrainz API
     - Get album, release date, tags
  3. **Update UI** → Display in `FloatingPlayer`

## 🧪 Testing the Metadata System

### Test Individual Tools

```bash
# Terminal 1: Start relay
bun run relay

# Terminal 2: Start ContextVM
bun run contextvm

# Terminal 3: Run test client
bun run contextvm/test-client.ts
```

Expected output:

```
🧪 Testing ContextVM Metadata Client
──────────────────────────────────────────────────
Test 1: Extract Stream Metadata
Stream URL: http://s5-webradio.antenne.de/chillout
✅ Metadata extracted:
{
  "station": "Antenne Bayern",
  "genre": "Chillout",
  "title": "Artist - Song Name"
}

Test 2: MusicBrainz Search
Query: artist='Radiohead', track='Creep'
✅ Found 5 results:
1. Creep by Radiohead
   MBID: xxx-xxx-xxx
   Release: Pablo Honey
   Score: 100
```

### Test in Browser

1. Open **http://localhost:3000**
2. **Open DevTools Console** (F12)
3. **Click play** on a station
4. **Watch console logs**:
   ```
   playerStore: playStation called for [Station Name]
   🎧 Extracting metadata from: http://...
   🔍 Searching MusicBrainz: Artist Name - Track Name
   ```

## 📁 Key Files

### Frontend

- `src/stores/playerStore.ts` - Player state + metadata polling
- `src/components/FloatingPlayer.tsx` - UI with metadata display
- `src/lib/metadataClient.ts` - ContextVM client

### Backend

- `contextvm/server.ts` - ContextVM MCP server
- `contextvm/tools/stream-metadata.ts` - Stream metadata extraction
- `contextvm/tools/musicbrainz.ts` - MusicBrainz integration

### Documentation

- `STATUS.md` - Full project status
- `PLAYER_IMPLEMENTATION.md` - Player architecture
- `METADATA_STRATEGY.md` - Metadata extraction guide
- `CONTEXTVM_SETUP.md` - ContextVM configuration

## 🔧 Configuration

### Default Development Setup

Everything works out of the box with development keys.

### Custom Configuration (Optional)

Create `.env` in project root:

```bash
# Relay
RELAY_URL=ws://localhost:3334

# ContextVM Server
METADATA_SERVER_KEY=your_hex_private_key_64_chars

# Frontend Client
METADATA_SERVER_PUBKEY=server_public_key_64_chars
METADATA_CLIENT_KEY=your_hex_private_key_64_chars
```

Generate keys:

```bash
openssl rand -hex 32
```

## 🎯 Next Steps

### Enhance Metadata

- Add album art from MusicBrainz
- Cache results to reduce API calls
- Store metadata in Nostr events

### Build Mobile App

```bash
bun run tauri:android
```

### Add Features

- Favorites/playlists
- Search and filtering
- Recently played history
- User profiles

## ❓ Troubleshooting

### No metadata showing?

- **Check ContextVM is running**: Should see "✅ Server is running..." message
- **Check stream supports metadata**: Not all streams provide it
- **Wait 15 seconds**: First poll happens immediately, then every 15s

### Audio won't play?

- **Check browser console**: Look for audio errors
- **Try different station**: Some streams might be offline
- **Check format**: HLS streams require modern browser or HLS.js

### ContextVM connection failed?

- **Verify relay is running**: `ps aux | grep relay`
- **Check Nostr keys**: Ensure server/client keys are set
- **Check console**: Look for connection errors

## 📚 Learn More

- **Architecture**: Read `PLAYER_IMPLEMENTATION.md`
- **Metadata Strategy**: Read `METADATA_STRATEGY.md`
- **API Docs**: Read `contextvm/README.md`
- **Nostr Protocol**: Read `SPEC.md`

## 🤝 Development Workflow

```bash
# Make changes to frontend
# → Bun HMR reloads automatically

# Make changes to ContextVM
# → Restart: Ctrl+C then `bun run contextvm`

# Make changes to relay
# → Restart: Ctrl+C then `bun run relay`

# Test everything
bun run build
```

---

**Ready to rock? Run `bun run dev` and start listening! 🎸**
