# Search Functionality

This relay implements [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) search capability using Bluge, a modern full-text search and indexing library for Go.

## Overview

The search implementation:
1. Uses PostgreSQL as the primary event store
2. Maintains a Bluge index for efficient text search
3. Routes search queries to Bluge and regular queries to PostgreSQL
4. Supports various search query types (exact match, wildcard, fuzzy)

## Implementation Details

### Architecture

When the relay receives an event:
1. The event is stored in PostgreSQL (primary store)
2. The event is indexed in Bluge for search

When the relay receives a query:
1. If the query contains a `search` filter, it's routed to Bluge
2. Otherwise, it's handled by PostgreSQL

### Indexed Fields

The following fields are indexed for search:

| Field | Description | Type |
|-------|-------------|------|
| `content` | Event content | Text |
| `id` | Event ID | Keyword |
| `pubkey` | Event author's public key | Keyword |
| `created_at` | Event creation timestamp | Numeric |
| `kind` | Event kind number | Numeric |
| `station_name` | Radio station name (from name tag) | Text + Keyword |
| `description` | Station description | Text |
| `genre` | Station genre (from t tag) | Text + Keyword |
| `language` | Station language code (from l tag) | Keyword |
| `country_code` | Station country (from countryCode tag) | Keyword |
| `location` | Station location (from location tag) | Text |
| `website` | Station website (from website tag) | Keyword |
| `domain` | Domain from nip05 tag | Keyword |
| All tags | All tags as `tag_[tagname]` | Keyword |

## NIP-50 Extensions

This implementation supports the following NIP-50 extensions:

| Extension | Description | Example |
|-----------|-------------|---------|
| `domain:` | Filter by nip05 domain | `domain:example.com` |
| `language:` | Filter by language code | `language:en` |
| `include:spam` | Include spam events (no-op, spam filtering not implemented) | `include:spam` |

## Search Examples

Here are some example search queries:

1. Basic search:
   ```
   ["REQ", "search1", {"search": "jazz"}]
   ```

2. Search with kind filter:
   ```
   ["REQ", "search2", {"kinds": [31237], "search": "jazz"}]
   ```

3. Search with author filter:
   ```
   ["REQ", "search3", {"authors": ["pubkey1", "pubkey2"], "search": "jazz"}]
   ```

4. Search with time range:
   ```
   ["REQ", "search4", {"since": 1609459200, "until": 1640995200, "search": "jazz"}]
   ```

5. Search with extension:
   ```
   ["REQ", "search5", {"search": "jazz domain:wavefunc.io"}]
   ```

6. Search by station name:
   ```
   ["REQ", "search6", {"kinds": [31237], "search": "FIP Radio"}]
   ```

## Indexing Existing Events

When you first add search capability to your relay, existing events in the PostgreSQL database won't be searchable. To index these events, run the included backfill script:

```bash
go run backfill_search.go --dsn="postgres://user:password@localhost:5432/dbname" --dir="./data"
```

Arguments:
- `--dsn`: PostgreSQL connection string (required)
- `--dir`: Data directory where the Bluge index is stored (default: "./data")
- `--batch`: Number of events to process per batch (default: 1000)

This script will:
1. Connect to your PostgreSQL database
2. Retrieve all events in batches
3. Index them in Bluge
4. Show progress and statistics

## Search Algorithm

The search algorithm:

1. Parses the search query and extracts any extensions
2. Creates a query that searches across multiple fields with different boost values:
   - Station name (2.0x boost)
   - Content (1.5x boost)
   - Description (1.5x boost)
   - Genre (1.2x boost)
   - Location (1.0x boost)
3. For each term, combines multiple query types:
   - Exact matches (highest boost)
   - Analyzed matches
   - Prefix matches
   - Wildcard contains
   - Fuzzy matches (allowing for typos)
4. Applies any filters from the query (authors, kinds, tags, etc.)
5. Applies any extensions (domain, language, etc.)
6. Returns results sorted by relevance

## Performance Considerations

1. The search index consumes additional disk space
2. Index updates happen synchronously with event processing
3. For very large installations, consider:
   - Using a separate machine for the search index
   - Implementing asynchronous indexing
   - Adding a caching layer

## Debugging

Search operation details are logged to the standard output when the relay runs. Look for lines containing "Search string", "Using multiple query types", or "Successfully indexed event" to debug search behavior.
