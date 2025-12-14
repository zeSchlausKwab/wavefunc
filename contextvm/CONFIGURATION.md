# Configuration Guide

## Server Configuration

The ContextVM metadata server needs a Nostr keypair to communicate via the relay.

### Development Keys (for testing only)

**Server:**

- Private Key: `0000000000000000000000000000000000000000000000000000000000000001`
- Public Key: `79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798`

**Client:**

- Private Key: `0000000000000000000000000000000000000000000000000000000000000002`
- Public Key: `c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5`

### Environment Variables

Create a `.env` file in the project root:

```bash
# Server configuration (contextvm/server.ts)
METADATA_SERVER_KEY=0000000000000000000000000000000000000000000000000000000000000001

# Client configuration (frontend)
METADATA_SERVER_PUBKEY=79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798
METADATA_CLIENT_KEY=0000000000000000000000000000000000000000000000000000000000000002

# Relay URL (shared)
RELAY_URL=ws://localhost:3334
```

### Generating Production Keys

For production, generate secure random keys:

```bash
# Generate server private key
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then derive the public key using nostr-tools or similar library.

## Usage in Player

Once configured, the metadata client will automatically connect when you call metadata functions:

```typescript
import {
  extractStreamMetadata,
  searchRecordings,
  searchArtists,
  searchReleases,
} from "./lib/metadataClient";

// Extract "now playing" from stream
const metadata = await extractStreamMetadata("http://stream.example.com/radio");
console.log(metadata);
// { title: "Artist - Song", artist: "Artist", song: "Song", ... }

// Search MusicBrainz for specific recordings
const recordings = await searchRecordings(metadata.song, metadata.artist);
console.log(recordings[0]);
// { id: "mbid", type: "recording", title: "Song", artist: "Artist", release: "Album", ... }

// Search for artists
const artists = await searchArtists("Led Zeppelin");
console.log(artists[0]);
// { id: "mbid", type: "artist", name: "Led Zeppelin", country: "GB", ... }

// Search for releases/albums
const albums = await searchReleases("IV", "Led Zeppelin");
console.log(albums[0]);
// { id: "mbid", type: "release", title: "IV", artist: "Led Zeppelin", ... }
```
