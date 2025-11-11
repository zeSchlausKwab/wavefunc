# Event Manager Utility

A command-line utility to query and delete Nostr events from relays.

## Features

- Query events by kind, author, or specific IDs
- Delete events by specific IDs
- Bulk delete events by filter (with confirmation)
- Support for multiple relays
- Uses your app's private key for authenticated deletions

## Prerequisites

- `nak` must be installed (Nostr Army Knife CLI tool)
- `APP_PRIVATE_KEY` must be set in your `.env` file

## Usage

### Query Events

Query events from relays:

```bash
# Query by kind and author
bun run scripts/event-manager.ts query --kind 30078 --author 210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2

# Query specific relays only
bun run scripts/event-manager.ts query --kind 30078 --author 210f... --relays ws://localhost:3334 wss://relay.wavefunc.live

# Limit results
bun run scripts/event-manager.ts query --kind 30078 --limit 10

# Query specific event IDs
bun run scripts/event-manager.ts query --ids abc123 def456
```

### Delete Events

Delete specific event IDs:

```bash
# Delete from all default relays
bun run scripts/event-manager.ts delete --ids abc123 def456

# Delete from specific relays only
bun run scripts/event-manager.ts delete --ids abc123 --relays wss://relay.wavefunc.live ws://localhost:3334

# Custom deletion reason
bun run scripts/event-manager.ts delete --ids abc123 --reason "Removing test data"
```

Bulk delete by filter (requires `--confirm`):

```bash
# First, query to see what will be deleted
bun run scripts/event-manager.ts query --kind 30078 --author 210f...

# Then delete with confirmation
bun run scripts/event-manager.ts delete --kind 30078 --author 210f... --confirm

# Delete from specific relays
bun run scripts/event-manager.ts delete --kind 30078 --author 210f... --confirm --relays ws://localhost:3334
```

## Options

- `--kind <kind>` - Event kind to query/delete
- `--author <pubkey>` - Author pubkey to query/delete
- `--ids <id1> [id2 ...]` - Specific event IDs to query/delete
- `--limit <number>` - Limit number of query results (default: 100)
- `--relays <url1> [url2 ...]` - Specific relays to use (default: all frontend relays)
- `--confirm` - Required for bulk deletions by filter
- `--reason <text>` - Deletion reason (default: "Event deletion")

## Default Relays

If no `--relays` are specified, the utility uses all relays from `src/frontend.tsx`:

- ws://localhost:3334
- wss://relay.wavefunc.live
- wss://relay.primal.net
- wss://relay.damus.io
- wss://purplepag.es
- wss://relay.nostr.band
- wss://nos.lol
- wss://relay.minibits.cash
- wss://relay.coinos.io/
- wss://relay.nostr.net
- wss://nwc.primal.net

## Examples

### Example 1: Query and Delete Featured Lists

```bash
# Query kind 30078 events (favorites lists) by app pubkey
bun run scripts/event-manager.ts query --kind 30078 --author 210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2

# Delete all found events
bun run scripts/event-manager.ts delete --kind 30078 --author 210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2 --confirm
```

### Example 2: Delete Specific Events from Production

```bash
# Delete specific event IDs from production relay
bun run scripts/event-manager.ts delete \
  --ids c24c239b3436d7e060346d9c0cae465d15bd0a0ed55cf0a8651efdfbe51f9bd1 \
  --relays wss://relay.wavefunc.live \
  --reason "Removing test data"
```

### Example 3: Clean Up Local Development Data

```bash
# Query what's on local relay
bun run scripts/event-manager.ts query --kind 30078 --relays ws://localhost:3334

# Delete everything found
bun run scripts/event-manager.ts delete --kind 30078 --confirm --relays ws://localhost:3334
```

## Safety Features

1. **Confirmation Required**: Bulk deletions by filter require the `--confirm` flag
2. **Preview Before Delete**: The utility shows what will be deleted before proceeding
3. **3-Second Delay**: When deleting by filter, there's a 3-second countdown to allow cancellation
4. **Authenticated**: Uses your app's private key to ensure only authorized deletions

## Troubleshooting

### "APP_PRIVATE_KEY environment variable is not set"

Make sure your `.env` file contains:

```
APP_PRIVATE_KEY=your_private_key_here
```

### "nak: command not found"

Install nak:

```bash
go install github.com/fiatjaf/nak@latest
```

### "failed to connect to any of the given relays"

- Check if the relay URLs are correct
- Verify the relay is running (for localhost)
- Check for SSL/TLS certificate issues (x509 errors)

## Notes

- Deletion events (kind 5) may not be honored by all relays
- Some relays block certain event kinds (e.g., purplepag.es only accepts kinds 0, 3, and 10002)
- The utility shows success/failure for each relay individually
