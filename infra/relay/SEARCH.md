# Search Implementation

This relay implements [NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md) search functionality using Bluge, a modern text indexing library for Go.

## Implementation

The search implementation leverages the native Bluge backend from [github.com/fiatjaf/eventstore/bluge](https://github.com/fiatjaf/eventstore/bluge), which provides full NIP-50 support while minimizing maintenance overhead.

## Features

- Full-text search across event content and metadata
- Support for NIP-50 extensions like `language:` and `domain:`
- Automatic indexing of new events
- Efficient searching with relevance ranking

## Radio Station Indexing

Radio stations in this system use the kind 31237 (as defined in RADIO_EVENT_KINDS.STREAM). When indexing radio station events, it's critical to ensure they have the correct kind value:

- All radio stations MUST use kind 31237
- The frontend search explicitly filters by this kind value
- Inconsistent kind values will cause stations to be "invisible" to search

### Checking for Indexing Issues

If your search isn't working properly, you can use the following tools to diagnose issues:

1. Use `inspect_index.go` to examine the indexed data:
   ```bash
   go run inspect_index.go --query="station name"
   ```
   
   Verify that all radio stations have `Kind: 31237` in the output.

2. Use `check_stations.go` to verify database records:
   ```bash
   go run check_stations.go --dsn="postgres://user:password@localhost:5432/dbname"
   ```

3. If issues are found, rebuild the index:
   ```bash
   rm -rf data/bluge_search
   go run backfill_search.go --dsn="postgres://user:password@localhost:5432/dbname" --dir="./data"
   ```

## Testing Search

To test the search functionality, you can:

1. Add test stations to the index:
   ```bash
   go run add_test_stations.go --dir="./data"
   ```

2. Inspect the index for specific queries:
   ```bash
   go run inspect_index.go --query="rock"
   ```

## Backfill Process

The backfill process reads events from PostgreSQL and adds them to the Bluge index. During this process, radio station events are detected and their kind is set to 31237 to ensure proper indexing.
