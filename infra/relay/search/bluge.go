package search

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strconv"
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
		fmt.Printf("Skipping empty content event: %s\n", evt.ID)
		return nil
	}

	fmt.Printf("Indexing event: ID=%s, Content=%s\n", evt.ID, evt.Content)

	// Create a new document
	doc := bluge.NewDocument(evt.ID)
	
	// Add event ID field
	doc.AddField(bluge.NewKeywordField("id", evt.ID).StoreValue())
	
	// Add pubkey field
	doc.AddField(bluge.NewKeywordField("pubkey", evt.PubKey).StoreValue())
	
	// Add content as text field
	doc.AddField(bluge.NewTextField("content", evt.Content).StoreValue())
	fmt.Printf("Added content field: %s\n", evt.Content)
	
	// For radio station events, parse the JSON content to extract description
	if evt.Kind == 31237 { // Radio Station Event kind
		var stationData map[string]interface{}
		if err := json.Unmarshal([]byte(evt.Content), &stationData); err == nil {
			// Extract and index description separately for better search
			if description, ok := stationData["description"].(string); ok && description != "" {
				doc.AddField(bluge.NewTextField("description", description).StoreValue())
				fmt.Printf("Added description field: %s\n", description)
			}
		}
	}
	
	// Add created_at as numeric field for time-based filtering
	doc.AddField(bluge.NewNumericField("created_at", float64(evt.CreatedAt)).StoreValue())
	
	// Add kind as numeric field
	doc.AddField(bluge.NewNumericField("kind", float64(evt.Kind)).StoreValue())
	
	// Add tags with enhanced indexing for radio station fields
	for _, tag := range evt.Tags {
		if len(tag) >= 2 {
			tagName := tag[0]
			tagValue := tag[1]
			
			// Basic tag indexing for all tags
			tagFieldName := fmt.Sprintf("tag_%s", tagName)
			doc.AddField(bluge.NewKeywordField(tagFieldName, tagValue).StoreValue())
			
			// Enhanced indexing for specific radio station tags
			switch tagName {
			case "name":
				// Index station name as both keyword (for exact match) and text (for fulltext search)
				doc.AddField(bluge.NewKeywordField("station_name", tagValue).StoreValue())
				doc.AddField(bluge.NewTextField("station_name_text", tagValue).StoreValue())
			case "website":
				doc.AddField(bluge.NewKeywordField("website", tagValue).StoreValue())
			case "t": // Genre/category
				doc.AddField(bluge.NewKeywordField("genre", tagValue).StoreValue())
				doc.AddField(bluge.NewTextField("genre_text", tagValue).StoreValue())
			case "l": // Language code
				doc.AddField(bluge.NewKeywordField("language", tagValue).StoreValue())
			case "countryCode":
				doc.AddField(bluge.NewKeywordField("country_code", tagValue).StoreValue())
			case "location":
				doc.AddField(bluge.NewTextField("location", tagValue).StoreValue())
			case "nip05": // Add support for domain filtering from NIP-50
				doc.AddField(bluge.NewKeywordField("nip05", tagValue).StoreValue())
				// Extract domain from nip05 for domain: extension
				if parts := strings.Split(tagValue, "@"); len(parts) == 2 {
					doc.AddField(bluge.NewKeywordField("domain", parts[1]).StoreValue())
				}
			}
		}
	}
	
	// Update the index with the document
	b.Lock()
	defer b.Unlock()
	
	err := b.writer.Update(doc.ID(), doc)
	if err != nil {
		fmt.Printf("Error updating index: %v\n", err)
		return err
	}
	
	fmt.Printf("Successfully indexed event: %s\n", evt.ID)
	return nil
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

// parseSearchTerms parses the search string into individual terms and extracts NIP-50 extensions
func parseSearchTerms(searchStr string) ([]string, map[string]string) {
	// Split by spaces
	terms := strings.Fields(searchStr)
	
	// Extract extensions like "domain:example.com" or "include:spam"
	filteredTerms := []string{}
	extensions := make(map[string]string)
	
	for _, term := range terms {
		if strings.Contains(term, ":") {
			parts := strings.SplitN(term, ":", 2)
			if len(parts) == 2 {
				key := strings.ToLower(parts[0])
				value := parts[1]
				extensions[key] = value
				fmt.Printf("Found extension: %s = %s\n", key, value)
				continue
			}
		}
		filteredTerms = append(filteredTerms, term)
	}
	
	fmt.Printf("Search string '%s' parsed into terms: %v with extensions: %v\n", 
		searchStr, filteredTerms, extensions)
	return filteredTerms, extensions
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
	
	// Parse search terms and extensions
	searchTerms, extensions := parseSearchTerms(filter.Search)
	
	// Build query
	var searchQuery bluge.Query
	
	// Build content query
	contentQuery := buildContentQuery(searchTerms)
	
	// Combine with filters (authors, kinds, etc.)
	conjunctionQuery := bluge.NewBooleanQuery()
	conjunctionQuery.AddMust(contentQuery)

	fmt.Printf("Conjunction query: %v\n", filter)
	
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
	
	// Handle NIP-50 extensions
	for extKey, extValue := range extensions {
		switch extKey {
		case "domain":
			// Domain extension - filter by domain
			domainQuery := bluge.NewTermQuery(extValue).SetField("domain")
			conjunctionQuery.AddMust(domainQuery)
			
		case "language":
			// Language extension - filter by language code
			langQuery := bluge.NewTermQuery(extValue).SetField("language")
			conjunctionQuery.AddMust(langQuery)
			
		case "include":
			// include:spam - no action needed, we don't implement spam filtering yet
			// This would be the place to disable spam filtering if implemented
			
		case "nsfw":
			// nsfw:true/false - no action needed yet as we don't have nsfw tagging
			// This would filter based on some nsfw field if implemented
			
		case "sentiment":
			// sentiment:positive/negative/neutral - no action yet as we don't analyze sentiment
			// Would filter based on sentiment analysis if implemented
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
				// Extract stored fields
				var eventID, content, pubkey string
				var eventCreatedAt uint64
				var eventKind uint64
				
				match.VisitStoredFields(func(field string, value []byte) bool {
					switch field {
					case "id":
						eventID = string(value)
					case "content":
						content = string(value)
					case "pubkey":
						pubkey = string(value)
					case "created_at":
						// Parse the numeric field
						if f, err := strconv.ParseFloat(string(value), 64); err == nil {
							eventCreatedAt = uint64(f)
						}
					case "kind":
						// Parse the numeric field
						if f, err := strconv.ParseFloat(string(value), 64); err == nil {
							eventKind = uint64(f)
						}
					}
					return true
				})
				
				if eventID != "" {
					// First try to get the event from the backing store if available
					if b.RawEventStore != nil {
						idFilter := nostr.Filter{IDs: []string{eventID}}
						evtCh, err := b.RawEventStore.QueryEvents(ctx, idFilter)
						if err == nil {
							// Try to get the event from the channel with a timeout
							select {
							case evt := <-evtCh:
								if evt != nil {
									select {
									case ch <- evt:
										// Successfully sent the event, move to next one
										match, err = dmi.Next()
										continue
									case <-ctx.Done():
										return
									}
								}
							case <-ctx.Done():
								return
							case <-time.After(200 * time.Millisecond):
								// Timeout getting event from store, fall through to construct from Bluge
								fmt.Printf("Timeout getting event from store: %s\n", eventID)
							}
						} else {
							fmt.Printf("Error querying raw event store: %v\n", err)
							// Fall through to construct from Bluge
						}
					}
					
					// If we got here, we need to construct an event from Bluge's data
					if content != "" && pubkey != "" {
						fmt.Printf("Constructing event from Bluge data: %s\n", eventID)
						
						evt := &nostr.Event{
							ID:        eventID,
							PubKey:    pubkey,
							CreatedAt: nostr.Timestamp(eventCreatedAt),
							Kind:      int(eventKind),
							Content:   content,
							Tags:      []nostr.Tag{},
							Sig:       "", // We don't have the signature
						}
						
						select {
						case ch <- evt:
						case <-ctx.Done():
							return
						}
					} else {
						fmt.Printf("Insufficient data to construct event: %s\n", eventID)
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

// buildContentQuery builds a query for searching across relevant fields
func buildContentQuery(terms []string) bluge.Query {
	if len(terms) == 0 {
		// Return match all if no terms
		fmt.Println("No search terms, using MatchAllQuery")
		return bluge.NewMatchAllQuery()
	}
	
	// Fields to search across with their boost values (higher = more important)
	searchFields := map[string]float64{
		"station_name_text": 2.0,    // Station name is most important
		"content":           1.5,     // Content is next
		"description":       1.5,     // Description is equally important
		"genre_text":        1.2,     // Genre is somewhat important
		"location":          1.0,     // Location is least important
	}
	
	// Try multiple query types for maximum matching
	if len(terms) == 1 {
		term := terms[0]
		fmt.Printf("Using multiple query types for: '%s' across multiple fields\n", term)
		
		// Main boolean query
		mainQuery := bluge.NewBooleanQuery()
		
		// Create field-specific queries for this term
		for field, boost := range searchFields {
			fieldQuery := bluge.NewBooleanQuery()
			
			// Term query (exact match, not analyzed)
			termQuery := bluge.NewTermQuery(term).SetField(field)
			termQuery.SetBoost(boost * 1.5) // Boost exact matches more
			fieldQuery.AddShould(termQuery)
			
			// Match query (analyzed)
			matchQuery := bluge.NewMatchQuery(term).SetField(field)
			matchQuery.SetBoost(boost)
			fieldQuery.AddShould(matchQuery)
			
			// Wildcard queries (prefix)
			wildcardQuery := bluge.NewWildcardQuery(term+"*").SetField(field)
			wildcardQuery.SetBoost(boost * 1.2)
			fieldQuery.AddShould(wildcardQuery)
			
			// Wildcard queries (contains)
			containsQuery := bluge.NewWildcardQuery("*"+term+"*").SetField(field)
			containsQuery.SetBoost(boost * 0.8)
			fieldQuery.AddShould(containsQuery)
			
			// Fuzzy query (allows typos)
			fuzzyQuery := bluge.NewFuzzyQuery(term)
			fuzzyQuery.SetField(field)
			fuzzyQuery.SetFuzziness(1)
			fuzzyQuery.SetBoost(boost * 0.7)
			fieldQuery.AddShould(fuzzyQuery)
			
			// Add the field query to the main query
			mainQuery.AddShould(fieldQuery)
		}
		
		return mainQuery
	}
	
	// For multiple terms, create a complex query
	fmt.Printf("Multiple term query for: %v across multiple fields\n", terms)
	mainQuery := bluge.NewBooleanQuery()
	
	// Process each term
	for _, term := range terms {
		termQuery := bluge.NewBooleanQuery()
		
		// Add this term across all fields
		for field, boost := range searchFields {
			fieldQuery := bluge.NewMatchQuery(term).SetField(field)
			fieldQuery.SetBoost(boost)
			termQuery.AddShould(fieldQuery)
		}
		
		// Add this term to main query as a SHOULD clause
		// This means documents matching more terms will score higher
		mainQuery.AddShould(termQuery)
	}
	
	return mainQuery
}

// GetPath returns the absolute path for the Bluge index directory
func GetPath(basePath string) string {
	return filepath.Join(basePath, "bluge_search")
} 