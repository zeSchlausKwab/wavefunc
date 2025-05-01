# NIP-50 Search Implementation

This relay implements the NIP-50 search capability using Bluge, a modern text indexing library for Go.

## How it Works

1. **Bluge Search Engine**: We use Bluge for efficient full-text search on event content.
2. **Dual Storage**: Events are stored in PostgreSQL and indexed in Bluge.
3. **Query Routing**: Search queries go to Bluge, regular queries to PostgreSQL.

## Using Search

Clients can send search queries using the standard NIP-50 format:

```json
{
    "kinds": [1],
    "search": "your search terms"
}
```

## Performance

- Bluge maintains its index in the configured data directory
- Search operations are fast even with large datasets
- The implementation handles concurrent operations efficiently

## Testing

For simple testing, use the provided test script:

```bash
go run test_search.go
```

## Implementation Details

- Search terms are joined with AND logic by default.
- Searches are performed on the `content` field only.
- Results are ordered by most recent first.
- A default limit of 100 is applied to prevent overwhelming results.

## Manual Index Creation

If the index isn't automatically created, you can run the SQL in `create_search_index.sql`:

```sql
CREATE INDEX IF NOT EXISTS events_content_search_idx
ON events USING gin(to_tsvector('english', content));
```

This will need to be run on your PostgreSQL database.

## Performance Considerations

- The GIN index will increase database size but significantly improve search performance.
- Initial index creation on large databases may take time.
- Consider adding additional indexes for frequently used filter combinations.

## Testing Search

You can test the search functionality using a Nostr client that supports NIP-50, or with a simple websocket client:

```json
["REQ", "search-request-id", { "kinds": [1], "search": "your search term" }]
```
