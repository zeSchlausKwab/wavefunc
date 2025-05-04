# Wavefunc Nostr Relay with Bluge Search

This is a Nostr relay implementation that supports [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) search functionality using Bluge, a modern text indexing library for Go.

## Features

- Standard Nostr relay functionality
- Full text search support via NIP-50
- PostgreSQL backend for storing events
- Bluge search backend for efficient full-text search
- Support for NIP-50 search extensions
- Advanced filtering by multiple attributes

## Getting Started

### Prerequisites

- Go 1.21.4 or later
- PostgreSQL database

### Environment Variables

- `POSTGRES_CONNECTION_STRING` - PostgreSQL connection string
- `DATABASE_URL` - Alternative for PostgreSQL connection (used by Railway)
- `DATA_DIR` - Directory to store Bluge search index files (default: "data")
- `PORT` - HTTP port to listen on (default: from `VITE_PUBLIC_RELAY_PORT` or 3002)

### Running Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/wavefunc.git
cd wavefunc/infra/relay

# Install dependencies
go mod download

# Run the relay
go run main.go
```

### Indexing Existing Events

When you first add search capability, existing events in PostgreSQL won't automatically be searchable. To index all existing events:

```bash
# Run the backfill script
go run backfill_search.go --dsn="postgres://user:password@localhost:5432/dbname" --dir="./data"
```

Arguments:

- `--dsn`: PostgreSQL connection string (required)
- `--dir`: Data directory for Bluge index (default: "./data")
- `--batch`: Batch size for processing (default: 1000)

## Architecture

The relay uses:

1. PostgreSQL as the primary event store for all Nostr events
2. Bluge as a specialized search engine for handling NIP-50 search requests

When an event is received:

- It's stored in PostgreSQL
- It's also indexed in Bluge for search capability

When a query is received:

- If it contains a `search` parameter, it's routed to Bluge
- Otherwise, it's processed by PostgreSQL

## Search Capabilities

The search functionality supports:

- Full-text search across multiple fields (content, name, description, genre, etc.)
- Multiple query types (exact, fuzzy, wildcard) for better results
- Filtering by authors, kinds, tags, and time ranges while searching
- NIP-50 extensions like `domain:` and `language:`
- Boosted fields for more relevant results (station names have higher priority)
- Sorting results by relevance

Example client request with search:

```json
["REQ", "search-request-id", { "kinds": [1], "search": "your search terms" }]
```

## Advanced Search Examples

```json
// Search for jazz stations with language filtering
["REQ", "advanced-search", {"kinds": [31237], "search": "jazz language:en"}]

// Search for stations by domain
["REQ", "domain-search", {"search": "domain:wavefunc.io"}]

// Search with author and time filters
["REQ", "filtered-search", {"authors": ["pubkey"], "since": 1609459200, "search": "rock"}]
```

## Performance Considerations

- Bluge maintains an index on disk in the specified `DATA_DIR`
- Search operations are optimized and fast even with large datasets
- The implementation handles concurrent reads and writes
- For large deployments, consider:
    - Using a separate machine for search indexing
    - Implementing asynchronous indexing
    - Adding a caching layer

## Search Implementation

The relay uses the native Bluge implementation from [github.com/fiatjaf/eventstore/bluge](https://github.com/fiatjaf/eventstore/bluge) for full-text search capabilities (implementing NIP-50). This approach simplifies maintenance and ensures compatibility with the Khatru relay ecosystem.

## Search Index Maintenance

If you need to rebuild the search index from scratch:

1. Stop the relay service
2. Delete the existing index directory:
    ```bash
    rm -rf data/bluge_search
    ```
3. Run the backfill script to reindex all events from PostgreSQL:
    ```bash
    go run backfill_search.go --dsn="postgres://user:password@localhost:5432/dbname" --dir="./data"
    ```
4. Restart the relay service

This process ensures all radio station events are properly indexed with the correct kind (31237) and field structure.

## Documentation

For more detailed information about the search functionality, see [SEARCH.md](./SEARCH.md).

# Nostr Relay Tools

This directory contains tools for managing the Nostr relay.

## Reset and Reindex Search Index

The relay provides built-in admin endpoints to reset and rebuild the search index. This is useful when:

- The search index is corrupted or outdated
- You need to rebuild the index after schema changes
- You want to ensure all events are properly indexed

### Using the Admin Endpoints

The relay has two admin endpoints for search index management:

1. **Start Reindexing**:

    ```
    POST /admin/reset-search-index
    ```

2. **Check Indexing Status**:

    ```
    GET /admin/indexing-status
    ```

3. **Publish Handler Info**:
    ```
    GET /admin/publish-handler
    ```

## NIP-89 Handler Publication

The relay supports publishing NIP-89 handler information events for radio stations. This allows clients to recognize your application as a handler for radio station events.

### Handler Event Publishing

To publish a handler event for your radio station application:

```bash
# Local development through API (default)
bun publish:handler [handler-id]

# Local development with direct publishing
bun publish:handler:direct [handler-id]

# Production through API
bun publish:handler:live [handler-id]

# Production with direct publishing
bun publish:handler:live:direct [handler-id]
```

Where:
- `handler-id` is an optional identifier for the handler (if omitted, a timestamp-based ID will be generated)

This command will:
1. Create a NIP-89 handler event (kind 31990)
2. Set the required tags according to the specification
3. Sign it with your admin key
4. Publish it to the relay (either through the API or directly)
5. Also publish a kind 0 metadata event with the application profile information

#### Publication Methods

The script supports two methods for publishing events:

1. **Through API** (default) - Events are created and signed by the client, then sent to the backend API endpoint which verifies and publishes them.
2. **Direct Publishing** - Events are created, signed, and published directly to the relay without going through the API endpoint.

The API-based approach allows for additional validation and permission checks on the server side before publishing, while direct publishing is simpler but less controlled.

#### Event Publication

The script publishes two events:

1. **Kind 31990 (NIP-89 Handler)** - Declares your application as a handler for radio station events
   - Contains information about supported kinds, URL templates, and app details
   - Uses a d-tag to make it replaceable (can be updated later with same handler ID)

2. **Kind 0 (Metadata)** - Creates a profile for your application
   - Contains basic profile information: name, picture, about, website, and NIP-05 identifier
   - Follows the standard metadata format from NIP-01

#### Configuration

The handler and profile information is defined in `scripts/publish-handler.ts`. You can customize:

- Application name and display name
- Application icon URL
- Description and website
- NIP-05 identifier for verification
- Web URL templates for opening stations

### Authentication

Admin endpoints can be secured using a token-based authentication:

1. Set the `ADMIN_AUTH_TOKEN` environment variable to a secure value
2. Include this token in the `Authorization` header when making requests:
    ```
    Authorization: Bearer YOUR_AUTH_TOKEN
    ```

### Example Usage

To trigger a reindex:

```bash
curl -X POST http://your-relay-host:3002/admin/reset-search-index \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

To check the status:

```bash
curl http://your-relay-host:3002/admin/indexing-status
```

The status endpoint returns a JSON response with the current indexing status:

```json
{
    "isIndexing": true,
    "status": "Processing batch at offset 5000 (5000/25000)",
    "percent": 20.0
}
```

### Important Notes

- Reindexing happens in the background and does not block the main relay operations
- The search index will be unavailable briefly at the end of the process while it's being updated
- Only one reindexing operation can run at a time

## Other Tools

- `backfill_search.go`: One-time script to initially build the search index (no HTTP server)
- `main.go`: Main relay server implementation

## Admin Authentication

The relay uses NIP-42 authentication to secure admin endpoints. There are two authentication methods:

1. **HTTP API Authentication:**

    - Uses custom HTTP headers for authenticating admin API calls
    - Requires setting the following HTTP headers:
        - `X-Admin-Pubkey`: Public key of the admin
        - `X-Admin-Timestamp`: Current timestamp in ISO format
        - `X-Admin-Signature`: Signature of the `{method}:{path}:{timestamp}` message

2. **NIP-42 WebSocket Authentication:**
    - For WebSocket connections, standard NIP-42 authentication is used
    - Admin commands via WebSocket require authentication with a public key listed in `APP_PUBKEY`

### Configuration

To set up admin authentication:

1. Add your admin public keys to the `APP_PUBKEY` environment variable (comma-separated)
2. For API calls, set `ADMIN_PRIVATE_KEY` and `ADMIN_PUBKEY` in your environment

### Admin Endpoints

The relay has several admin endpoints:

- `/admin/reset-search-index` - Reset and rebuild the search index
- `/admin/indexing-status` - Check the status of an ongoing index rebuild
- `/admin/test-auth` - Test authentication is working correctly

## Admin Tools

The repository includes admin tools to interact with these endpoints:

```bash
# Using the Bun script from project root
bun admin             # Show help
bun admin:test        # Test authentication
bun admin:status      # Check indexing status
bun admin:reset-index # Reset and rebuild the search index
bun admin:curl        # Use the simple curl script

# Or run directly from scripts directory
cd scripts
bun admin-nostr.ts test-auth
./test-admin.sh
```

These tools use the credentials in your environment variables to authenticate with the relay.
