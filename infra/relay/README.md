# Wavefunc Nostr Relay with Bluge Search

This is a Nostr relay implementation that supports [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) search functionality using Bluge, a modern text indexing library for Go.

## Features

- Standard Nostr relay functionality
- Full text search support via NIP-50
- PostgreSQL backend for storing events
- Bluge search backend for efficient full-text search

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

- Full-text search on event content
- Filtering by authors, kinds, tags, and time ranges while searching
- Sorting results by recency (newest first)

Example client request with search:

```json
["REQ", "search-request-id", {"kinds": [1], "search": "your search terms"}]
```

## Performance Considerations

- Bluge maintains an index on disk in the specified `DATA_DIR`
- Search operations are optimized and fast even with large datasets
- The implementation handles concurrent reads and writes 