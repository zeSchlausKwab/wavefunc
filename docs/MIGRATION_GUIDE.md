# Legacy Database Migration Guide

## Overview

This guide explains how to migrate radio stations from the legacy MariaDB database to your new Nostr-based relay.

## Quick Start

```bash
# Option 1: Automatic (integrated into dev)
bun dev                  # Starts relay + migrates 500 stations + starts frontend

# Option 2: Manual
bun run relay            # Start relay
bun run migrate          # Migrates 500 random stations (default)
bun run migrate 100      # Migrate specific number
```

That's it! The stations are now in your Nostr relay.

## What Happens

The migration script:

1. **Reads** `legacy-db/latest.sql` (MariaDB dump)
2. **Parses** ~55,000 stations from INSERT statements
3. **Deduplicates** stations by name + country (merges into multi-stream events)
4. **Selects** N random stations (default: 500)
5. **Converts** each station to Nostr event format (kind 31237)
6. **Publishes** to your local relay

## Data Mapping

### Legacy Database → Nostr Event

**Legacy Station Fields:**

- StationID, Name, Url, Homepage, Favicon
- Country, CountryCode, Language, LanguageCodes
- Tags (genres), Codec, Bitrate
- GeoLat, GeoLong, StationUuid

**Nostr Event (kind 31237):**

```json
{
  "kind": 31237,
  "content": {
    "description": "<tags or fallback>",
    "streams": [
      {
        "url": "<UrlCache or Url>",
        "format": "<audio/mpeg|aac|ogg|etc>",
        "quality": {
          "bitrate": "<bitrate * 1000>",
          "codec": "<codec lowercase>",
          "sampleRate": 44100
        },
        "primary": true
      }
    ]
  },
  "tags": [
    ["d", "<StationUuid>"],
    ["name", "<Name>"],
    ["countryCode", "<CountryCode>"],
    ["location", "<Country>"],
    ["website", "<Homepage>"],
    ["thumbnail", "<Favicon>"],
    ["l", "<language1>"],
    ["l", "<language2>"],
    ["c", "<genre1>", "genre"],
    ["c", "<genre2>", "genre"],
    ["g", "<geohash>"]
  ]
}
```

## Usage Examples

### Migrate Different Amounts

```bash
# Test with just 10 stations
bun run migrate 10

# Production migration with 1000 stations
bun run migrate 1000

# All stations (~55,000) - this will take a while!
bun run migrate 55000
```

### Reset and Re-migrate

```bash
# Reset the relay database
bun run relay:reset

# Start fresh relay
bun run relay

# Migrate new random selection
bun run migrate
```

### Use with Search

After migration, you can search the stations:

```typescript
// In your app
const ndk = new NDK({ explicitRelayUrls: ["ws://localhost:3334"] });
await ndk.connect();

// Search for jazz stations
const filter = {
  kinds: [31237],
  search: "jazz",
};

const events = await ndk.fetchEvents(filter);
```

## File Structure

```
legacy-db/
├── latest.sql           # MariaDB dump (~450,000 lines)
└── README.md           # Detailed database documentation

scripts/
├── migrate_legacy.ts   # Migration script
├── seed.ts            # Dev seed script (fake data)
├── gen_station.ts     # Station generator
└── gen_user.ts        # User generator
```

## Legacy Database Structure

### Station Table (Simplified)

| Field         | Type       | Description             |
| ------------- | ---------- | ----------------------- |
| StationID     | bigint     | Unique ID               |
| Name          | text       | Station name            |
| Url           | text       | Stream URL              |
| UrlCache      | text       | Resolved URL (use this) |
| Homepage      | text       | Website                 |
| Favicon       | text       | Logo URL                |
| Country       | varchar    | Country name            |
| CountryCode   | varchar(2) | ISO code                |
| Language      | varchar    | Language                |
| LanguageCodes | text       | CSV of codes            |
| Tags          | text       | CSV of genres           |
| Codec         | varchar    | MP3, AAC+, etc.         |
| Bitrate       | int        | Kbps                    |
| GeoLat        | double     | Latitude                |
| GeoLong       | double     | Longitude               |
| StationUuid   | char(36)   | UUID                    |
| Votes         | int        | Vote count              |

### Additional Tables (Not Used)

- `IPVoteCheck` - Vote tracking
- `LanguageCache` - Language statistics
- `TagCache` - Genre statistics
- `StationHistory` - Change history
- `StreamingServers` - Server details
- `StationCheckStep` - Health checks

## Features of Migration Script

✅ **Robust Parsing** - Handles SQL INSERT statements
✅ **Deduplication** - Merges duplicate stations into multi-stream events
✅ **Random Selection** - Gets diverse station sample
✅ **Complete Mapping** - All relevant fields converted
✅ **Multi-Stream Support** - Combines streams from duplicates
✅ **Geohash Support** - Converts coordinates to geohash
✅ **MIME Type Detection** - Maps codecs to formats
✅ **Progress Tracking** - Shows migration progress
✅ **Error Handling** - Continues on failures

## Troubleshooting

### Connection Failed

**Error:** `Failed to connect to relay`

**Solution:**

```bash
# Start the relay first
bun run relay
```

### No Stations Found

**Error:** `Found 0 stations in database`

**Solution:**

- Check that `legacy-db/latest.sql` exists
- Verify file is not empty
- Check file permissions

### Parsing Errors

**Error:** `Failed to parse station INSERT`

**Cause:** Complex SQL syntax or escape sequences

**Solution:**

- Check console for specific line number
- Simplify problematic INSERT statements
- Or skip those stations (script continues)

### Slow Migration

**Issue:** Large migration taking too long

**Solution:**

- Migrate in smaller batches
- Example: `bun run migrate 100` multiple times
- Each run selects different random stations

## Best Practices

### For Development

1. Use automatic dev workflow: `bun dev` (migrates 500 stations)
2. Or test with smaller samples: `bun run migrate 10`
3. Use fake data if needed: `bun dev:fake`
4. Reset often: `bun run relay:reset`

### For Production

1. Validate legacy database integrity first
2. Start with moderate size: `bun run migrate 500`
3. Monitor relay performance
4. Check event publication success rate
5. Verify search indexing works

### For Testing

1. Mix migration with seed data:

   ```bash
   bun run relay:reset
   bun run relay &
   bun run migrate 50    # Real stations
   bun run seed          # Test users
   ```

2. Test search with real data
3. Verify UI handles real station data

## Next Steps

After successful migration:

1. **Test Search**: Try searching for genres, countries, languages
2. **Check Data Quality**: Review migrated stations in UI
3. **Add More**: Migrate more stations as needed
4. **Production**: Deploy relay with migrated data

## FAQ

**Q: Can I migrate specific stations?**
A: Currently random selection only. Modify script for specific criteria.

**Q: What happens to duplicate stations?**
A: They're published as separate events (different UUIDs).

**Q: Can I update migrated stations?**
A: Yes! Kind 31237 is replaceable. Publish with same `d` tag.

**Q: How do I backup migrated data?**
A: Copy `relay/data/` directory. It contains SQLite DB and search index.

**Q: Can I migrate from a live database?**
A: Yes! Export to SQL first, then use this script.

## Support

- **Legacy DB Structure**: See [legacy-db/README.md](legacy-db/README.md)
- **Nostr Event Spec**: See [SPEC.md](SPEC.md)
- **Relay Docs**: See [relay/README.md](relay/README.md)
