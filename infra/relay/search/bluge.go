package search

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/blugelabs/bluge"
	"github.com/fiatjaf/eventstore"
	"github.com/nbd-wtf/go-nostr"
)

// BlugeSearch implements a search backend using Bluge
type BlugeSearch struct {
	sync.Mutex
	Path          string
	RawEventStore eventstore.Store
	writer        *bluge.Writer
}

// Init initializes the Bluge search backend
func (b *BlugeSearch) Init() error {
	b.Lock()
	defer b.Unlock()

	// Create config with default settings
	config := bluge.DefaultConfig(b.Path)
	
	// Open writer
	writer, err := bluge.OpenWriter(config)
	if err != nil {
		return fmt.Errorf("error opening bluge writer: %w", err)
	}
	
	b.writer = writer
	return nil
}

// Close closes the Bluge writer
func (b *BlugeSearch) Close() error {
	b.Lock()
	defer b.Unlock()
	
	if b.writer != nil {
		return b.writer.Close()
	}
	return nil
}

// SaveEvent indexes an event for search
func (b *BlugeSearch) SaveEvent(ctx context.Context, evt *nostr.Event) error {
	// Skip if no content to index
	if evt.Content == "" {
		return nil
	}

	// Create a new document
	doc := bluge.NewDocument(evt.ID)
	
	// Add event ID field
	doc.AddField(bluge.NewKeywordField("id", evt.ID).StoreValue())
	
	// Add pubkey field
	doc.AddField(bluge.NewKeywordField("pubkey", evt.PubKey).StoreValue())
	
	// Add content as text field
	doc.AddField(bluge.NewTextField("content", evt.Content).StoreValue())
	
	// Add created_at as numeric field for time-based filtering
	doc.AddField(bluge.NewNumericField("created_at", float64(evt.CreatedAt)).StoreValue())
	
	// Add kind as numeric field
	doc.AddField(bluge.NewNumericField("kind", float64(evt.Kind)).StoreValue())
	
	// Add tags
	for _, tag := range evt.Tags {
		if len(tag) >= 2 {
			tagName := tag[0]
			tagValue := tag[1]
			
			// Add each tag as a keyword field
			doc.AddField(bluge.NewKeywordField(fmt.Sprintf("tag_%s", tagName), tagValue).StoreValue())
		}
	}
	
	// Update the index with the document
	b.Lock()
	defer b.Unlock()
	
	return b.writer.Update(doc.ID(), doc)
}

// DeleteEvent removes an event from the search index
func (b *BlugeSearch) DeleteEvent(ctx context.Context, evt *nostr.Event) error {
	b.Lock()
	defer b.Unlock()
	
	return b.writer.Delete(bluge.Identifier(evt.ID))
}

// ReplaceEvent replaces an event in the search index
func (b *BlugeSearch) ReplaceEvent(ctx context.Context, evt *nostr.Event) error {
	return b.SaveEvent(ctx, evt)
}

// QueryEvents performs a search query and returns matching events
func (b *BlugeSearch) QueryEvents(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
	// If search is not requested, reject this query
	if filter.Search == "" {
		return nil, fmt.Errorf("bluge backend only handles search queries")
	}
	
	// Open a reader
	b.Lock()
	reader, err := b.writer.Reader()
	b.Unlock()
	if err != nil {
		return nil, fmt.Errorf("error getting bluge reader: %w", err)
	}
	
	// Build query
	var searchQuery bluge.Query
	
	// Basic search query on content
	searchTerms := parseSearchTerms(filter.Search)
	contentQuery := buildContentQuery(searchTerms)
	
	// Combine with filters (authors, kinds, etc.)
	conjunctionQuery := bluge.NewBooleanQuery()
	conjunctionQuery.AddMust(contentQuery)
	
	// Add filter for authors (pubkeys)
	if len(filter.Authors) > 0 {
		authorsQuery := bluge.NewBooleanQuery()
		for _, author := range filter.Authors {
			authorsQuery.AddShould(bluge.NewTermQuery(author).SetField("pubkey"))
		}
		conjunctionQuery.AddMust(authorsQuery)
	}
	
	// Add filter for kinds
	if len(filter.Kinds) > 0 {
		kindsQuery := bluge.NewBooleanQuery()
		for _, kind := range filter.Kinds {
			kindsQuery.AddShould(bluge.NewNumericRangeQuery(float64(kind), float64(kind)).SetField("kind"))
		}
		conjunctionQuery.AddMust(kindsQuery)
	}
	
	// Add filter for time range
	if filter.Since != nil {
		sinceQuery := bluge.NewNumericRangeQuery(float64(*filter.Since), float64(time.Now().Unix())).SetField("created_at")
		conjunctionQuery.AddMust(sinceQuery)
	}
	
	if filter.Until != nil {
		untilQuery := bluge.NewNumericRangeQuery(0, float64(*filter.Until)).SetField("created_at")
		conjunctionQuery.AddMust(untilQuery)
	}
	
	// Add tag filters
	for tagName, tagValues := range filter.Tags {
		if len(tagValues) > 0 {
			tagQuery := bluge.NewBooleanQuery()
			for _, tagValue := range tagValues {
				tagQuery.AddShould(bluge.NewTermQuery(tagValue).SetField(fmt.Sprintf("tag_%s", tagName)))
			}
			conjunctionQuery.AddMust(tagQuery)
		}
	}
	
	searchQuery = conjunctionQuery
	
	// Set default limit if not specified
	limit := 100
	if filter.Limit > 0 {
		limit = filter.Limit
	}
	
	// Create search request
	searchRequest := bluge.NewTopNSearch(limit, searchQuery).
		SortBy([]string{"-created_at"}) // Sort by created_at descending (newest first)
	
	// Execute search
	dmi, err := reader.Search(ctx, searchRequest)
	if err != nil {
		reader.Close()
		return nil, fmt.Errorf("error executing search: %w", err)
	}
	
	// Channel to send results
	ch := make(chan *nostr.Event)
	
	go func() {
		defer reader.Close()
		defer close(ch)
		
		// Iterate through search results
		match, err := dmi.Next()
		for err == nil && match != nil {
			select {
			case <-ctx.Done():
				return
			default:
				// Get document ID
				var eventID string
				match.VisitStoredFields(func(field string, value []byte) bool {
					if field == "id" {
						eventID = string(value)
						return false
					}
					return true
				})
				
				if eventID != "" && b.RawEventStore != nil {
					// Get the full event from the backing store
					idFilter := nostr.Filter{IDs: []string{eventID}}
					evtCh, err := b.RawEventStore.QueryEvents(ctx, idFilter)
					if err != nil {
						fmt.Printf("error querying raw event store: %v\n", err)
					} else {
						// Get the first (and should be only) event from the channel
						select {
						case evt := <-evtCh:
							if evt != nil {
								select {
								case ch <- evt:
								case <-ctx.Done():
									return
								}
							}
						case <-ctx.Done():
							return
						}
					}
				}
			}
			
			match, err = dmi.Next()
		}
		
		if err != nil {
			fmt.Printf("error iterating search results: %v\n", err)
		}
	}()
	
	return ch, nil
}

// Helper functions

// parseSearchTerms parses the search string into individual terms
func parseSearchTerms(searchStr string) []string {
	// Basic implementation - split by spaces
	terms := strings.Fields(searchStr)
	
	// Filter out any special commands like "include:spam"
	filteredTerms := []string{}
	for _, term := range terms {
		if !strings.Contains(term, ":") {
			filteredTerms = append(filteredTerms, term)
		}
	}
	
	return filteredTerms
}

// buildContentQuery builds a query for the content field from search terms
func buildContentQuery(terms []string) bluge.Query {
	if len(terms) == 0 {
		// Return match all if no terms
		return bluge.NewMatchAllQuery()
	}
	
	if len(terms) == 1 {
		// Single term query
		return bluge.NewMatchQuery(terms[0]).SetField("content")
	}
	
	// Multiple terms - create a conjunction query (AND)
	conjunctionQuery := bluge.NewBooleanQuery()
	for _, term := range terms {
		termQuery := bluge.NewMatchQuery(term).SetField("content")
		conjunctionQuery.AddMust(termQuery)
	}
	
	return conjunctionQuery
}

// GetPath returns the absolute path for the Bluge index directory
func GetPath(basePath string) string {
	return filepath.Join(basePath, "bluge_search")
} 