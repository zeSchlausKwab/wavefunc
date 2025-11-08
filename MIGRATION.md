# Radio Station Migration Guide

This guide explains how to migrate legacy radio station data to the Nostr-based WaveFunc system.

## Overview

The migration system supports two modes:

1. **Local Migration** - Run migration directly on your local machine
2. **Remote Migration** - Trigger migration on your VPS from your local machine

All migrated station events are signed with the `APP_PRIVATE_KEY` configured in your `.env` file.

## Local Migration

Run migration on your local machine with access to the legacy database:

```bash
# Migrate 500 stations to local relay
bun run migrate 500

# Migrate to a specific relay
bun run migrate 500 --relay=wss://relay.example.com
```

**Requirements:**

- Legacy database dump at `legacy-db/latest.sql`
- `APP_PRIVATE_KEY` set in `.env`

## Remote Migration (VPS)

Trigger migration on your VPS from your local machine using authenticated API calls.

### Setup

1. **Configure your `.env` file:**

```bash
# Your VPS hostname (without protocol)
VPS_HOST=wavefunc.live

# Application private key (used for both signing events AND authentication)
APP_PRIVATE_KEY=your_private_key_hex
```

2. **Deploy your application** to the VPS with:

   - The application running on the VPS
   - `APP_PRIVATE_KEY` set in the VPS `.env.production`
   - Legacy database at `legacy-db/latest.sql`

3. **Trigger migration from your local machine:**

```bash
# Migrate 500 stations (default)
bun run migrate:vps

# Migrate a specific count
bun run migrate:vps 1000

# Migrate to a specific relay (optional)
bun run migrate:vps 1000 --relay=wss://relay.example.com

# Reset the relay before migrating (deletes all existing data)
bun run migrate:vps:reset

# Reset and migrate with custom parameters
bun run migrate:vps 50000 --relay=wss://relay.wavefunc.live --reset
```

**⚠️ Warning:** The `--reset` flag will:

- Stop the relay process on the VPS
- Delete the relay database (`relay/data/events.db`)
- Delete the search index (`relay/data/search/`)
- This **permanently removes all events** from the relay

### How It Works

1. **Local CLI** ([scripts/trigger_remote_migration.ts](scripts/trigger_remote_migration.ts))

   - Creates a NIP-98 HTTP Auth event signed with your `APP_PRIVATE_KEY`
   - Sends POST request to `https://{VPS_HOST}/api/migrate`
   - Streams migration output back to your terminal

2. **VPS API Endpoint** ([src/index.tsx](src/index.tsx#L40))

   - Verifies NIP-98 authentication using your pubkey
   - If `--reset` flag is provided:
     - Kills the relay process
     - Deletes the database and search index files
   - Spawns migration process on the VPS
   - Streams output back to the client

3. **Migration Script** ([scripts/migrate_legacy.ts](scripts/migrate_legacy.ts))
   - Reads legacy SQL database
   - Converts stations to Nostr kind 31237 events
   - Signs all events with `APP_PRIVATE_KEY`
   - Publishes to the specified relay

### Security

- **NIP-98 Authentication** ensures only requests signed with your `APP_PRIVATE_KEY` can trigger migrations
- The VPS verifies that the auth event:
  - Is properly signed
  - Matches the expected pubkey (derived from `APP_PRIVATE_KEY`)
  - Has the correct URL and method
  - Was created within the last 60 seconds

### Troubleshooting

**"APP_PRIVATE_KEY environment variable is required"**

- Make sure `APP_PRIVATE_KEY` is set in your local `.env` file

**"VPS_HOST environment variable is required"**

- Make sure `VPS_HOST` is set in your `.env` file

**"Unauthorized - Invalid NIP-98 authentication"**

- Verify your local `APP_PRIVATE_KEY` matches the VPS `APP_PRIVATE_KEY`
- Check that the VPS application is running
- Ensure your system clock is synchronized (NIP-98 requires timestamp within 60s)

**Connection errors**

- Verify your VPS_HOST is correct
- Check that the application is running on the VPS
- Ensure HTTPS is properly configured

## Migration Process Details

The migration script:

1. Reads the legacy SQL dump from `legacy-db/latest.sql`
2. Parses stations, metadata, and streaming servers
3. Deduplicates stations based on name + country + homepage
4. Merges duplicate entries to create multi-stream stations
5. Randomly selects N stations (configurable via count parameter)
6. Converts each to a Nostr kind 31237 event with:
   - Station metadata (name, location, genres, etc.)
   - Multiple stream URLs with quality info
   - Signed with `APP_PRIVATE_KEY`
7. Publishes to the relay
8. Seeds fake favorites lists for development users

## Event Structure

All station events are **kind 31237** (Internet Radio) with:

- `d` tag: Station UUID (unique identifier)
- `name` tag: Station name
- `countryCode` tag: ISO country code
- `location` tag: Human-readable location
- `website` tag: Station homepage
- `thumbnail` tag: Station logo/favicon
- `l` tags: Language codes
- `c` tags: Genre categories
- `g` tag: Geohash coordinates

Content JSON contains:

```json
{
  "description": "Station description",
  "streams": [
    {
      "url": "https://...",
      "format": "audio/mpeg",
      "quality": {
        "bitrate": 128000,
        "codec": "mp3",
        "sampleRate": 44100
      },
      "primary": true
    }
  ],
  "streamingServerUrl": "https://..." // Optional
}
```

## Resources

- [NIP-98: HTTP Auth](https://nostr-nips.com/nip-98)
- [Nostr Tools](https://nostrtool.com/) - Generate keys
- [WaveFunc Relay](relay/) - Go-based Nostr relay with search
